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
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { CfnParameter, Duration } from 'aws-cdk-lib';
import { readFileSync } from 'fs';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';

export class ArmadaInfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /****************************************************************
     * CDK Deploy Variables
     ****************************************************************/
    const accessKey = new CfnParameter(this, 'accessKey', {
      type: 'String',
      description: 'Please enter your access key id.',
    });

    const secretKey = new CfnParameter(this, 'secretKey', {
      type: 'String',
      description: 'Please enter your your secret key.',
    });

    /****************************************************************
     * Access Roles
     ****************************************************************/

    enum ManagedPolicies {
      SecretsManagerReadWrite = 'SecretsManagerReadWrite',
      AmazonRDSFullAccess = 'AmazonRDSFullAccess',
    }

    // Secrets manager
    const secretsManagerRole = new iam.Role(this, 'Admin-Node-Access-Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com', {
        region: 'us-east-1a',
      }),
      description: 'Allow EC2 to access AWS Secrets Manager and RDS',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          ManagedPolicies.SecretsManagerReadWrite
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          ManagedPolicies.AmazonRDSFullAccess
        ),
        {
          managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonCognitoPowerUser',
        },
      ],
    });

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
      ],
      natGateways: 0,
    });

    /****************************************************************
     * Security Groups
     ****************************************************************/
    // Application Load Balancer Security Groups
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

    // AdminNode Security Group
    const adminNodeSecurityGroup = new ec2.SecurityGroup(this, 'ec2-rds-1', {
      vpc,
      description: 'The security group for the admin node',
    });

    adminNodeSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH access'
    );

    // RDS Security Group
    const rdsSecurityGroup = new ec2.SecurityGroup(this, 'rds-ec2-1', {
      vpc,
      description: 'The security group for the rds instance',
    });

    rdsSecurityGroup.connections.allowFrom(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTraffic(),
      'Allow all traffic on all ports coming from Application Load Balancer'
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
      keyName: 'armada-admin-node',
    });

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
      loadBalancerName: 'ArmadaLoadBalancer',
    });

    // TODO: eventually we want to use port 443 and HTTPS
    // const listener = alb.addListener('ALB-Listener', {
    //   port: 80, // listens for requests on port 80
    //   open: true, // Allow CDK to automatically create security group rule to allow traffic on port 80

    //   protocol: elbv2.ApplicationProtocol.HTTP,

    //   // Specify the default action for the ALB's Listener on Port 80
    //   defaultAction: elbv2.ListenerAction.fixedResponse(404, {
    //     contentType: 'text/plain',
    //     messageBody: `The developer environment you've requested could not be found.`,
    //   }),
    // });

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
     * Cognito User Pool
     ****************************************************************/
    // ATTENTION: Cognito user pools are immutable
    // once a user pool has been created it cannot be changed.
    const cognitoUserPool = new cognito.UserPool(this, 'Cognito-User-Pool', {
      userPoolName: 'Cognito-User-Pool',
      signInCaseSensitive: false,
      // users are allowed to sign up
      selfSignUpEnabled: false,
      // users are allowed to sign in with email only
      signInAliases: {
        email: false,
        username: true,
      },
      // attributes cognito will request verification for
      autoVerify: {
        email: true,
      },

      // keep original email, until user verifies new email
      keepOriginal: {
        email: true,
      },

      // Sign up
      // standard attributes users must provide when signing up
      standardAttributes: {
        // required
        email: {
          required: true,
          mutable: true,
        },
        // preferredUsername: {
        //   required: false,
        //   mutable: true
        // },
        // to be updated when user sets up profile
        givenName: {
          required: true,
          mutable: true,
        },
        familyName: {
          required: true,
          mutable: true,
        },
        // timezone: {
        //   required: false,
        //   mutable: true
        // },
        // profilePage: {
        //   required: false,
        //   mutable: true
        // },
        // lastUpdateTime: {
        //   required: false,
        //   mutable: true
        // },
        // website: {
        //   required: false,
        //   mutable: true
        // },
        profilePicture: {
          required: false,
          mutable: true,
        },
      },
      // non-standard attributes that will store user profile info
      // custom attributes cannot be marked as required
      customAttributes: {
        isAdmin: new cognito.StringAttribute({ mutable: true }),
      },
      // password policy criteria
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(7),
      },
      // how users can recover their account if they forget their password
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // whether the user pool should be retained in the account after the
      // stack is deleted. set `cdk.RemovalPolicy.` to `RETAIN` when launching to production
      removalPolicy: cdk.RemovalPolicy.DESTROY,

      /* User verification
        - When a user signs up, email and SMS messages are used to verify their
          account and contact methods.
        - The following code snippet configures a user pool with properties to 
          these verification messages:
      */
      userVerification: {
        emailSubject: 'Please verify your email to get started using Armada!',
        emailBody:
          'Thanks for signing up to Armada! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      userInvitation: {
        emailSubject: 'Invite to join Armada!',
        emailBody:
          'Hello {username}, you have been invited to join Armada! Your temporary password is {####}',
      },

      email: cognito.UserPoolEmail.withCognito('support@releasethefleet.com'),
    });

    // Cognito App Client
    const cognitoClient = cognitoUserPool.addClient('Cognito-App-Client');

    // Add a default admin user.
    const adminUser = new cognito.CfnUserPoolUser(this, 'MyCfnUserPoolUser', {
      userPoolId: cognitoUserPool.userPoolId,

      // the properties below are optional
      userAttributes: [
        { name: 'custom:isAdmin', value: `true` },
        { name: 'given_name', value: `Armada` },
        { name: 'family_name', value: `Admin` },
        { name: 'email', value: `thefourofours@gmail.com` },
      ],
      username: 'ArmadaAdmin',
    });

    // Outputs
    new cdk.CfnOutput(this, 'userPoolId', {
      value: cognitoUserPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'userPoolClientId', {
      value: cognitoClient.userPoolClientId,
    });

    /****************************************************************
     * Database (RDS)
     ****************************************************************/

    // first, lets generate a secret to be used as credentials for our database
    const databaseCredentialsSecret = new secretsManager.Secret(
      this,
      `database-DBCredentialsSecret`,
      {
        secretName: `database-credentials`,
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            username: 'postgres',
          }),
          excludePunctuation: true,
          includeSpace: false,
          generateStringKey: 'password',
        },
      }
    );

    // lets output a few properties to help use find the credentials
    // new cdk.CfnOutput(this, 'Secret Name', {
    //   value: databaseCredentialsSecret.secretName,
    // });
    // new cdk.CfnOutput(this, 'Secret ARN', {
    //   value: databaseCredentialsSecret.secretArn,
    // });
    // new cdk.CfnOutput(this, 'Secret Full ARN', {
    //   value: databaseCredentialsSecret.secretFullArn || '',
    // });

    // next, create a new string parameter to be used
    new ssm.StringParameter(this, 'DBCredentialsArn', {
      parameterName: `database-credentials-arn`,
      stringValue: databaseCredentialsSecret.secretArn,
    });

    const engine = rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.VER_13_7,
    });

    const dbInstance = new rds.DatabaseInstance(this, 'Postgres-Database', {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      engine,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO
      ),
      availabilityZone: 'us-east-1a',
      securityGroups: [rdsSecurityGroup],
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
      credentials: rds.Credentials.fromSecret(databaseCredentialsSecret),
    });

    /****************************************************************
     * Admin Node
     ****************************************************************/
    const userDataScript = readFileSync('./lib/user-data.sh', 'utf8');

    const adminNode = new ec2.Instance(this, 'Armada-AdminNode', {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.SMALL
      ),
      availabilityZone: 'us-east-1a',
      securityGroup: adminNodeSecurityGroup,
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      role: secretsManagerRole,
      keyName: 'armada-admin-node',
    });

    adminNode.addUserData(userDataScript);
    adminNode.node.addDependency(dbInstance);

    // RDS post-installation repo
    // https://github.com/team-armada/rds-post-installation

    //TODO: create IAM roles for EC2 instance to talk to RDS and SecretsManager

    /****************************************************************
     * ECS Admin
     ****************************************************************/
    // db-secrets
    // username
    // password

    // Load Balancer
    //  - If the route matches cohort-course-user go to that workspace
    //  - Default Route: Go to Admin App.

    // Create our admin app task definition
    // Interpolate all the values that are necessary



    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'Armada-App', {
      executionRole: new iam.Role(this, 'taskExecutionRole', {
        description: "ecsTaskExecutionRole", 
        managedPolicies: [
          {
            managedPolicyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
          }, 
          {
            managedPolicyArn: "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceRole"
          }
        ],
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
      }),

      taskRole: new iam.Role(this, 'ArmadaAppECSPermission', {
        description: 'Allow EC2 to access AWS Secrets Manager and RDS',
        managedPolicies: [
          {
            managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonRDSFullAccess',
          },
          {
            managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonCognitoPowerUser',
          },
          {
            managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonESCognitoAccess',
          },
          {
            managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonECS_FullAccess',
          },
          {
            managedPolicyArn: 'arn:aws:iam::aws:policy/AWSLambda_FullAccess',
          },
        ],
        inlinePolicies: {
          PassRole: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ['iam:PassRole'],
                effect: iam.Effect.ALLOW,
                resources: ['*'],
              }),
            ],
          }),
        },
        assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      }),
    });

    const armadaApp = taskDefinition.addContainer('armada-app', {
      image: ecs.ContainerImage.fromRegistry('jdguillaume/armada-application'),
      memoryLimitMiB: 512,
      essential: true,
      portMappings: [
        {
          hostPort: 0,
          containerPort: 5432,
          protocol: ecs.Protocol.TCP,
        },
      ],
      environment: {
        AWS_REGION: cdk.Stack.of(this).region,
        AWS_IAM_ACCESS_KEY_ID: accessKey.valueAsString,
        AWS_IAM_SECRET_ACCESS_KEY: secretKey.valueAsString,
        DATABASE_URL: `postgresql://postgres:${databaseCredentialsSecret
          .secretValueFromJson('password')
          .unsafeUnwrap()}@${dbInstance.dbInstanceEndpointAddress}:${
          dbInstance.dbInstanceEndpointPort
        }/Armada?schema=public`,
        PORT: '3000',
        USER_POOL_ID: cognitoUserPool.userPoolId,
        USER_POOL_WEB_CLIENT_ID: cognitoClient.userPoolClientId,
      },
    });

    const armadaAppNginx = taskDefinition.addContainer('armada-app-nginx', {
      image: ecs.ContainerImage.fromRegistry('jdguillaume/armada-app-nginx'),
      memoryLimitMiB: 256,
      essential: true,
      portMappings: [
        {
          hostPort: 0,
          containerPort: 80,
          protocol: ecs.Protocol.TCP,
        },
      ],
    });

    armadaAppNginx.addLink(armadaApp);

    // Instantiate an Amazon ECS Service
    const ecsService = new ecs.Ec2Service(this, 'Service', {
      cluster,
      serviceName: 'ArmadaAdminApp',
      taskDefinition,
    });

    // run task
    const runTask = new tasks.EcsRunTask(this, 'Run', {
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      cluster,
      taskDefinition,
      launchTarget: new tasks.EcsEc2LaunchTarget({
        placementStrategies: [ecs.PlacementStrategy.spreadAcrossInstances()],
      }),
    });

    const armadaAppTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      'ArmadaApp',
      {
        healthCheck: {
          path: '/',
        },
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targets: [
          ecsService.loadBalancerTarget({
            containerName: 'armada-app-nginx',
            containerPort: 80,
          }),
        ],
        vpc,
      }
    );

    const listener = alb.addListener('ALB-Listener', {
      port: 80, // listens for requests on port 80
      open: true, // Allow CDK to automatically create security group rule to allow traffic on port 80

      protocol: elbv2.ApplicationProtocol.HTTP,

      // Specify the default action for the ALB's Listener on Port 80
      defaultAction: elbv2.ListenerAction.forward([armadaAppTargetGroup]),
    });
  }
}
