import * as path from 'path';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib'; 
import * as ec2 from 'aws-cdk-lib/aws-ec2'; 
import * as efs from 'aws-cdk-lib/aws-efs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export interface EFSStackProps extends cdk.NestedStackProps {
  vpc: ec2.Vpc;
  efsSecurityGroup: ec2.SecurityGroup; 
}

export class EFSStack extends cdk.NestedStack {
  public fileSystem: efs.FileSystem; 
  
  constructor(scope: Construct, id: string, props: EFSStackProps) {
    super(scope, id, props);

    this.fileSystem = new efs.FileSystem(this, 'ArmadaFileSystem', {
        vpc: props.vpc,
        securityGroup: props.efsSecurityGroup,
        lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
        performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
        outOfInfrequentAccessPolicy: efs.OutOfInfrequentAccessPolicy.AFTER_1_ACCESS,
        enableAutomaticBackups: true,
        fileSystemName: 'ArmadaPermanentStorage',
      }
    );

    // Add an Access Point for the Lambda to use.
    const lambdaEFSAccessPoint = new efs.AccessPoint(this, 'ArmadaLambdaAccess', {
        fileSystem: this.fileSystem,
        createAcl: { ownerUid: '0', ownerGid: '0', permissions: '0777' },
        posixUser: { uid: '0', gid: '0' },
      }
    );

    const lambdaAccessRole = new iam.Role(this, 'LambdaAccessRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description:
        'Allows the AWS Lambda access to the VPC and provides write functionality to EFS.',
      managedPolicies: [
        {
          managedPolicyArn:
            'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
        },

        {
          managedPolicyArn:
            'arn:aws:iam::aws:policy/AmazonElasticFileSystemClientFullAccess',
        },
      ],
    });

    const storageLambda = new lambda.Function(this, 'createEFSFolders', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'createEFSFolders.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas')),
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      securityGroups: [props.efsSecurityGroup],
      role: lambdaAccessRole,
      vpc: props.vpc,
      filesystem: lambda.FileSystem.fromEfsAccessPoint(lambdaEFSAccessPoint, '/mnt/efs'),
      allowPublicSubnet: true,
      functionName: 'createEFSFolders',
    });

  }

}