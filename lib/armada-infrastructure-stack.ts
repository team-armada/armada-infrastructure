import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export class ArmadaInfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /****************************************************************
     * Virtual Private Cloud (VPC)
     ****************************************************************/
    const vpc = new ec2.Vpc(this, 'VPC', {
      cidr: '10.0.0.0/16',
      maxAzs: 3,
      subnetConfiguration: [
        {
          name: 'publicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'privateSubnet',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
      natGateways: 0,
    });

    /****************************************************************
     * Security Groups
     ****************************************************************/

    //Application Load Balancer Security Groups
    const albSecurityGroup = new ec2.SecurityGroup(this, 'ALB-Security-Group', {
      vpc,
      description: 'ALB Security Group',
    });

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP Access'
    );

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(80),
      'HTTP Access'
    );

    // Launch Template Security Groups
    const ltSecurityGroup = new ec2.SecurityGroup(
      this,
      'Launch-Template-Security-Group',
      {
        vpc,
        allowAllOutbound: true,
        description: 'Security Group for Launch Template ECS Instances',
      }
    );

    ltSecurityGroup.connections.allowFrom(
      new ec2.Connections({
        securityGroups: [albSecurityGroup],
      }),
      ec2.Port.allTraffic(),
      'Allow all traffic on all ports coming from Application Load Balancer'
    );

    // RDS Connection Security Group
    const RDSConnSecurityGroup = new ec2.SecurityGroup(
      this,
      'RDS-Connection-Security-Group',
      {
        vpc,
        allowAllOutbound: true,
        description: 'Security Group for connections between EC2 instances and RDS',
      }
    );

    RDSConnSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'HTTP Access'
    );

     // Security Group for Storage
    const ArmadaStorageSecurity = new ec2.SecurityGroup(
      this,
      'EFSSecurityGroup',
      {
        vpc,
        description: 'Security Group for the Elastic File System',
        securityGroupName: 'Security Group for Armada Permanent Storage',
      }
    );

    /****************************************************************
     * Launch Template
     ****************************************************************/
    const launchTemplate = new ec2.LaunchTemplate(this, 'ASG-Launch-Template', {
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.SMALL
      ),
      securityGroup: ltSecurityGroup,
      userData: ec2.UserData.forLinux(),
      // grant ec2 instances communication access to ECS cluster
      role: new iam.Role(this, 'ec2AccessRole', {
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      }),
    });

    launchTemplate.connections.addSecurityGroup(RDSConnSecurityGroup);

    /****************************************************************
     * Auto Scaling Group
     ****************************************************************/
    // Explicitly add customized capacity through ASG
    const asg = new autoscaling.AutoScalingGroup(this, 'Auto-Scaling-Group', {
      vpc,
      launchTemplate,
      minCapacity: 1,
      desiredCapacity: 1,
      maxCapacity: 10,
    });

    asg.scaleOnCpuUtilization('cpu-util-scaling', {
      targetUtilizationPercent: 50,
    });

    /****************************************************************
     * Elastic Container Service
     ****************************************************************/
    // ECS Capacity Provider
    // A capacity provider is an abstraction that uses an ASG underneath
    // It's a way to make your ECS cluster "ASG-aware". Think ASG adapter for ECS
    // ECS capacity provider
    const capacityProvider = new ecs.AsgCapacityProvider(
      this,
      'ASG-Capacity-Provider',
      {
        capacityProviderName: 'ASG-Capacity-Provider',
        // manage cluster scaling using ASG strategy
        autoScalingGroup: asg,
      }
    );

    const cluster = new ecs.Cluster(this, 'ECS-Cluster', {
      clusterName: 'ECS-Cluster',
      vpc,
      // collect metrics and logs from your containers
      containerInsights: true, // enabled for CloudWatch logs
    });

    // Attach Security group to ECS cluster
    cluster.addAsgCapacityProvider(capacityProvider);

    /****************************************************************
     * Application Load Balancer
     ****************************************************************/
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Load-Balancer', {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });

    // TODO: eventually we want to use port 443 and HTTPS
    const listener = alb.addListener('ALB-Listener', {
      port: 80, // listens for requests on port 80
      open: true, // Allow CDK to automatically create security
      // group rule to allow traffic on port 80
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    // When you add an autoscaling group as the target
    // CDK automatically puts the instances associated with that ASG into a target group
    listener.addTargets('Target-Group-ASG', {
      port: 80,
      // send traffic to automatically created Target Group
      // that contains any instance created by Auto Scaling Group
      targets: [asg],
      healthCheck: {
        enabled: true,
        healthyHttpCodes: '200-299',
        path: '/',
      },
    });

    // Create CFN Output
    new cdk.CfnOutput(this, 'ALB-DNS-name', {
      value: alb.loadBalancerDnsName,
    });

    /****************************************************************
     * Elastic File System
     ****************************************************************/

    const ArmadaPermanentStorage = new efs.FileSystem(
      this,
      'ArmadaFileSystem',
      {
        vpc,
        securityGroup: ArmadaStorageSecurity,
        lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
        performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
        outOfInfrequentAccessPolicy:
          efs.OutOfInfrequentAccessPolicy.AFTER_1_ACCESS,
        enableAutomaticBackups: true,
        fileSystemName: 'ArmadaPermanentStorage',
      }
    );

    ArmadaPermanentStorage.connections.allowFrom(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(2049),
      'Allow Network File Storage'
    );

    // Add an Access Point for the Lambda to use.
    const lambdaEFSAccessPoint = new efs.AccessPoint(
      this,
      'ArmadaLambdaAccess',
      {
        fileSystem: ArmadaPermanentStorage,
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

    /****************************************************************
     * Lambda
     ****************************************************************/

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
      securityGroups: [ArmadaStorageSecurity],
      role: lambdaAccessRole,
      vpc,
      filesystem: lambda.FileSystem.fromEfsAccessPoint(
        lambdaEFSAccessPoint,
        '/mnt/efs'
      ),
      allowPublicSubnet: true,
      functionName: 'createEFSFolders',
    });


    /****************************************************************
     * Database (RDS)
     ****************************************************************/

    // first, lets generate a secret to be used as credentials for our database
    const databaseCredentialsSecret = new secretsManager.Secret(this, `database-DBCredentialsSecret`, {
      secretName: `database-credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'postgres',
        }),
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: 'password'
      }
    });

    // lets output a few properties to help use find the credentials
    new cdk.CfnOutput(this, 'Secret Name', { value: databaseCredentialsSecret.secretName });
    new cdk.CfnOutput(this, 'Secret ARN', { value: databaseCredentialsSecret.secretArn });
    new cdk.CfnOutput(this, 'Secret Full ARN', { value: databaseCredentialsSecret.secretFullArn || '' });

    // next, create a new string parameter to be used
    new ssm.StringParameter(this, 'DBCredentialsArn', {
      parameterName: `database-credentials-arn`,
      stringValue: databaseCredentialsSecret.secretArn,
    });

    const engine = rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_13_7 });

    const dbInstance = new rds.DatabaseInstance(this, 'Postgres-Database', {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      engine,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO,
      ),

      multiAz: false,
      allocatedStorage: 100,
      maxAllocatedStorage: 105,
      allowMajorVersionUpgrade: false,
      autoMinorVersionUpgrade: true,
      backupRetention: cdk.Duration.days(0),
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      databaseName: 'PostgresDatabase',
      publiclyAccessible: false,
    });

    dbInstance.connections.allowFrom(
      new ec2.Connections({
        securityGroups: [RDSConnSecurityGroup],
      }),
      ec2.Port.allTraffic(),
      'Allow all traffic from EC2 instances on RDS connection security group'
    );

    new cdk.CfnOutput(this, 'dbEndpoint', {
      value: dbInstance.instanceEndpoint.hostname,
    });

    new cdk.CfnOutput(this, 'secretName', {
      // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
      value: dbInstance.secret?.secretName!,
    });
  }
}
