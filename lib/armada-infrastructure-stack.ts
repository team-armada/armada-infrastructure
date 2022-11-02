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
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Duration } from 'aws-cdk-lib';

export class ArmadaInfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // /****************************************************************
    //  * Virtual Private Cloud (VPC)
    //  ****************************************************************/
    // const vpc = new ec2.Vpc(this, 'VPC', {
    //   cidr: '10.0.0.0/16',
    //   maxAzs: 3,
    //   subnetConfiguration: [
    //     {
    //       name: 'publicSubnet',
    //       subnetType: ec2.SubnetType.PUBLIC,
    //       cidrMask: 24,
    //     },
    //   ],
    //   natGateways: 0,
    // });

    // /****************************************************************
    //  * Security Groups
    //  ****************************************************************/
    // // Application Load Balancer Security Groups
    // const albSecurityGroup = new ec2.SecurityGroup(this, 'ALB-Security-Group', {
    //   vpc,
    //   description: 'ALB Security Group',
    // });

    // albSecurityGroup.addIngressRule(
    //   ec2.Peer.anyIpv4(),
    //   ec2.Port.tcp(80),
    //   'HTTP Access'
    // );

    // albSecurityGroup.addIngressRule(
    //   ec2.Peer.anyIpv6(),
    //   ec2.Port.tcp(80),
    //   'HTTP Access'
    // );

    // // Launch Template Security Groups
    // const ltSecurityGroup = new ec2.SecurityGroup(
    //   this,
    //   'Launch-Template-Security-Group',
    //   {
    //     vpc,
    //     allowAllOutbound: true,
    //     description: 'Security Group for Launch Template ECS Instances',
    //   }
    // );

    // ltSecurityGroup.connections.allowFrom(
    //   new ec2.Connections({
    //     securityGroups: [albSecurityGroup],
    //   }),
    //   ec2.Port.allTraffic(),
    //   'Allow all traffic on all ports coming from Application Load Balancer'
    // );

    // // Security Group for Storage
    // const ArmadaStorageSecurity = new ec2.SecurityGroup(
    //   this,
    //   'EFSSecurityGroup',
    //   {
    //     vpc,
    //     description: 'Security Group for the Elastic File System',
    //     securityGroupName: 'Security Group for Armada Permanent Storage',
    //   }
    // );

    // /****************************************************************
    //  * Launch Template
    //  ****************************************************************/
    // const launchTemplate = new ec2.LaunchTemplate(this, 'ASG-Launch-Template', {
    //   machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
    //   instanceType: ec2.InstanceType.of(
    //     ec2.InstanceClass.T2,
    //     ec2.InstanceSize.SMALL
    //   ),
    //   securityGroup: ltSecurityGroup,
    //   userData: ec2.UserData.forLinux(),
    //   // grant ec2 instances communication access to ECS cluster
    //   role: new iam.Role(this, 'ec2AccessRole', {
    //     assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    //   }),
    // });

    // /****************************************************************
    //  * Auto Scaling Group
    //  ****************************************************************/
    // // Explicitly add customized capacity through ASG
    // const asg = new autoscaling.AutoScalingGroup(this, 'Auto-Scaling-Group', {
    //   vpc,
    //   launchTemplate,
    //   minCapacity: 1,
    //   desiredCapacity: 1,
    //   maxCapacity: 10,
    // });

    // asg.scaleOnCpuUtilization('cpu-util-scaling', {
    //   targetUtilizationPercent: 50,
    // });

    // /****************************************************************
    //  * Elastic Container Service
    //  ****************************************************************/
    // // ECS Capacity Provider
    // // A capacity provider is an abstraction that uses an ASG underneath
    // // It's a way to make your ECS cluster "ASG-aware". Think ASG adapter for ECS
    // // ECS capacity provider
    // const capacityProvider = new ecs.AsgCapacityProvider(
    //   this,
    //   'ASG-Capacity-Provider',
    //   {
    //     capacityProviderName: 'ASG-Capacity-Provider',
    //     // manage cluster scaling using ASG strategy
    //     autoScalingGroup: asg,
    //   }
    // );

    // const cluster = new ecs.Cluster(this, 'ECS-Cluster', {
    //   clusterName: 'ECS-Cluster',
    //   vpc,
    //   // collect metrics and logs from your containers
    //   containerInsights: true, // enabled for CloudWatch logs
    // });

    // // Attach Security group to ECS cluster
    // cluster.addAsgCapacityProvider(capacityProvider);

    // /****************************************************************
    //  * Application Load Balancer
    //  ****************************************************************/
    // const alb = new elbv2.ApplicationLoadBalancer(this, 'Load-Balancer', {
    //   vpc,
    //   internetFacing: true,
    //   securityGroup: albSecurityGroup,
    // });

    // // TODO: eventually we want to use port 443 and HTTPS
    // const listener = alb.addListener('ALB-Listener', {
    //   port: 80, // listens for requests on port 80
    //   open: true, // Allow CDK to automatically create security
    //   // group rule to allow traffic on port 80
    //   protocol: elbv2.ApplicationProtocol.HTTP,
    // });

    // // When you add an autoscaling group as the target
    // // CDK automatically puts the instances associated with that ASG into a target group
    // listener.addTargets('Target-Group-ASG', {
    //   port: 80,
    //   // send traffic to automatically created Target Group
    //   // that contains any instance created by Auto Scaling Group
    //   targets: [asg],
    //   healthCheck: {
    //     enabled: true,
    //     healthyHttpCodes: '200-299',
    //     path: '/',
    //   },
    // });

    // // Create CFN Output
    // new cdk.CfnOutput(this, 'ALB-DNS-name', {
    //   value: alb.loadBalancerDnsName,
    // });

    // /****************************************************************
    //  * Elastic File System
    //  ****************************************************************/

    // const ArmadaPermanentStorage = new efs.FileSystem(
    //   this,
    //   'ArmadaFileSystem',
    //   {
    //     vpc,
    //     securityGroup: ArmadaStorageSecurity,
    //     lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
    //     performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
    //     outOfInfrequentAccessPolicy:
    //       efs.OutOfInfrequentAccessPolicy.AFTER_1_ACCESS,
    //     enableAutomaticBackups: true,
    //     fileSystemName: 'ArmadaPermanentStorage',
    //   }
    // );

    // ArmadaPermanentStorage.connections.allowFrom(
    //   ec2.Peer.anyIpv4(),
    //   ec2.Port.tcp(2049),
    //   'Allow Network File Storage'
    // );

    // // Add an Access Point for the Lambda to use.
    // const lambdaEFSAccessPoint = new efs.AccessPoint(
    //   this,
    //   'ArmadaLambdaAccess',
    //   {
    //     fileSystem: ArmadaPermanentStorage,
    //     createAcl: {
    //       ownerUid: '0',
    //       ownerGid: '0',
    //       permissions: '0777',
    //     },
    //     posixUser: {
    //       uid: '0',
    //       gid: '0',
    //     },
    //   }
    // );

    // /****************************************************************
    //  * Lambda
    //  ****************************************************************/

    // const lambdaAccessRole = new iam.Role(this, 'LambdaAccessRole', {
    //   assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    //   description:
    //     'Allows the AWS Lambda access to the VPC and provides write functionality to EFS.',
    //   managedPolicies: [
    //     {
    //       managedPolicyArn:
    //         'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
    //     },

    //     {
    //       managedPolicyArn:
    //         'arn:aws:iam::aws:policy/AmazonElasticFileSystemClientFullAccess',
    //     },
    //   ],
    // });

    // const storageLambda = new lambda.Function(this, 'createEFSFolders', {
    //   runtime: lambda.Runtime.NODEJS_16_X,
    //   handler: 'createEFSFolders.handler',
    //   code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas')),
    //   memorySize: 128,
    //   timeout: cdk.Duration.seconds(5),
    //   securityGroups: [ArmadaStorageSecurity],
    //   role: lambdaAccessRole,
    //   vpc,
    //   filesystem: lambda.FileSystem.fromEfsAccessPoint(
    //     lambdaEFSAccessPoint,
    //     '/mnt/efs'
    //   ),
    //   allowPublicSubnet: true,
    //   functionName: 'createEFSFolders',
    // });


    /****************************************************************
     * Cognito User Pool
    ****************************************************************/
    // ATTENTION: Cognito user pools are immutable
    // once a user pool has been created it cannot be changed.
    const cognitoUserPool = new cognito.UserPool(this, 'Cognito-User-Pool', {
      userPoolName: 'Cognito-User-Pool', 
      signInCaseSensitive: false, 
      // users are allowed to sign up
      selfSignUpEnabled: true, 
      // users are allowed to sign in with email only
      signInAliases: {
        email: true, 
      }, 
      // attributes cognito will request verification for 
      autoVerify: {
        email: true, 
      }, 
      // keep original email, until user verifies new email
      keepOriginal: {
        email: true
      },

      // Sign up 
      // standard attributes users must provide when signing up 
      standardAttributes: {
        // required
        email: {
          required: true, 
          mutable: true
        },
        preferredUsername: {
          required: false, 
          mutable: true
        },
        // to be updated when user sets up profile 
        givenName: {
          required: false, 
          mutable: true
        }, 
        familyName: {
          required: false, 
          mutable: true
        }, 
        timezone: {
          required: false, 
          mutable: true
        }, 
        profilePage: {
          required: false, 
          mutable: true
        },
        lastUpdateTime: {
          required: false, 
          mutable: true
        },
        website: {
          required: false, 
          mutable: true
        },
        profilePicture: {
          required: false, 
          mutable: true
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
        tempPasswordValidity: Duration.days(7)
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
        emailBody: 'Thanks for signing up to Armada! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      userInvitation: {
        emailSubject: 'Invite to join Armada!',
        emailBody: 'Hello {username}, you have been invited to join Armada! Your temporary password is {####}',
      },

      email: cognito.UserPoolEmail.withCognito("support@releasethefleet.com")
    });
    
    // Cognito App Client 
    const client = cognitoUserPool.addClient('Cognito-App-Client'); 

    // Outputs
    new cdk.CfnOutput(this, 'userPoolId', {
      value: cognitoUserPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'userPoolClientId', {
      value: client.userPoolClientId,
    });
    
    



    // --------------------------------------------------------------------
    // NOTE: Front-end testing 
    // to test auth in frontend use `userPoolId` and `userPoolClientId`
    // in your AWS Cognito AWS Console
  }
}
