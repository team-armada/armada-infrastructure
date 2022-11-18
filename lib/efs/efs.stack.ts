import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { ManagedPolicies } from "../../utils/policies"; 


export interface EFSStackProps extends cdk.NestedStackProps {
  readonly vpc: ec2.Vpc; 
}


export class EFSStack extends cdk.NestedStack {
  public efsSecurityGroup: ec2.SecurityGroup; 
  public efs: efs.FileSystem; 
  public lambdaEFSAccessPoint: efs.AccessPoint;
  public lambdaAccessRole: iam.Role;
  public storageLambda: lambda.Function;

  constructor(scope: Construct, id: string, props?: EFSStackProps) {
    super(scope, id, props); 

    // Validation 
    if (!props?.vpc) {
      throw new Error('Please provide a reference to the vpc')
    }

    // Security Group for Storage
    this.efsSecurityGroup = new ec2.SecurityGroup(this, 'EFS-Security-Group', {
        vpc: props.vpc,
        description: 'Security Group for the Elastic File System',
        securityGroupName: 'Security Group for Armada Permanent Storage',
      }
    );

    // Elastic File System 
    this.efs = new efs.FileSystem(this, 'Elastic-File-System',
      {
        vpc: props.vpc,
        securityGroup: this.efsSecurityGroup,
        lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
        performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
        outOfInfrequentAccessPolicy:
          efs.OutOfInfrequentAccessPolicy.AFTER_1_ACCESS,
        enableAutomaticBackups: true,
        fileSystemName: 'ArmadaPermanentStorage',
      }
    );

    this.efs.connections.allowFrom(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(2049),
      'Allow Network File Storage'
    );

    // Access Point for the Lambda to use.
    this.lambdaEFSAccessPoint = new efs.AccessPoint(this, 'lambdaEFSAccessPoint',
      {
        fileSystem: this.efs,
        createAcl: {
          ownerUid: '0',
          ownerGid: '0',
          permissions: '0777',
        },
        posixUser: {
          uid: '0',
          gid: '0',
        },
      }
    );

    // Lambda Access Role 
    this.lambdaAccessRole = new iam.Role(this, 'LambdaAccessRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description:
        'Allows the AWS Lambda access to the VPC and provides write functionality to EFS.',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          ManagedPolicies.AWSLambdaVPCAccessExecutionRole
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          ManagedPolicies.AmazonElasticFileSystemClientFullAccess
        ),
      ],
    });

    // Storage Lambda to create EFS Folders
    this.storageLambda = new lambda.Function(this, 'createEFSFolders', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'createEFSFolders.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, "../../lambdas")),
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      securityGroups: [this.efsSecurityGroup],
      role: this.lambdaAccessRole,
      vpc: props.vpc,
      filesystem: lambda.FileSystem.fromEfsAccessPoint(
        this.lambdaEFSAccessPoint,
        '/mnt/efs'
      ),
      allowPublicSubnet: true,
      functionName: 'createEFSFolders',
    });
  }
}