import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { ManagedPolicies } from '../../utils/policies';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export interface ClusterStackProps extends cdk.NestedStackProps {
  readonly vpc: ec2.Vpc; 
  readonly keyPairName: string | undefined; 
  readonly region: string | undefined;
  readonly accessKeyId: string | undefined;
  readonly secretAccessKey: string | undefined;
  readonly databaseCredentialsSecret: secretsManager.Secret; 
  readonly dbInstance: rds.DatabaseInstance; 
  readonly cognitoUserPool: cognito.UserPool; 
  readonly cognitoClient: cognito.UserPoolClient; 
}


export class ClusterStack extends cdk.NestedStack {
  public asg: autoscaling.AutoScalingGroup; 
  public ecs: ecs.Cluster; 
  public alb: elbv2.ApplicationLoadBalancer; 

  constructor(scope: Construct, id: string, props?: ClusterStackProps) {
    super(scope, id, props); 

    // Validation 
    if (!props?.vpc) {
      throw new Error('Please provide a reference to the vpc')
    }

    if (!props?.region) {
      throw new Error('Please provide a region')
    }

    if (!props?.accessKeyId) {
      throw new Error('Please provide the access key id')
    }

    if (!props?.secretAccessKey) {
      throw new Error('Please provide the secret access key')
    }

    // Application Load Balancer Security Groups
    const albSecurityGroup = new ec2.SecurityGroup(this, 'ALB-Security-Group', {
      vpc: props.vpc,
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

    /**********************************************
     * Launch Template 
    ***********************************************/
    // Launch Template Security Groups
    const ltSecurityGroup = new ec2.SecurityGroup(this, 'Launch-Template-SG', {
        vpc: props.vpc,
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
      keyName: props.keyPairName,
    });


    /**********************************************
     * Application Load Balancer 
    ***********************************************/
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Load-Balancer', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      loadBalancerName: 'ArmadaLoadBalancer',
    });

    /**********************************************
     * Auto-Scaling Group 
    ***********************************************/
    this.asg = new autoscaling.AutoScalingGroup(this, 'Auto-Scaling-Group', {
      vpc: props.vpc,
      launchTemplate,
      minCapacity: 1,
      desiredCapacity: 1,
      maxCapacity: 10,
    });

    // Scale up based on ECS Memory Reservation for the ECS-Cluster
    this.asg.scaleOnMetric('ScaleUpOnMemoryReservation', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'MemoryReservation',
        dimensionsMap: {
          ClusterName: 'ECS-Cluster',
        },
        statistic: 'Average',
      }),
      // Add 1 instance if memory reservation is greater than 75%
      scalingSteps: [
        {
          lower: 60,
          change: 1,
        },
        // Remove 1 instance if memory reservation is less than 15%
        {
          upper: 15,
          change: -1,
        },
      ],

      adjustmentType: autoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
      cooldown: cdk.Duration.seconds(60),
    });


    /**********************************************
     * ECS
    ***********************************************/
    // ECS Capacity Provider
    // A capacity provider is an abstraction that uses an ASG underneath
    // It's a way to make your ECS cluster "ASG-aware". Think ASG adapter for ECS
    // ECS capacity provider
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'ASG-Capacity-Provider',
      {
        capacityProviderName: 'ASG-Capacity-Provider',
        // manage cluster scaling using ASG strategy
        autoScalingGroup: this.asg,
      }
    );

    this.ecs = new ecs.Cluster(this, 'ECS-Cluster', {
      clusterName: 'ECS-Cluster',
      vpc: props.vpc,
      // collect metrics and logs from your containers
      containerInsights: true, // enabled for CloudWatch logs
    });

    // Attach Security group to ECS cluster
    this.ecs.addAsgCapacityProvider(capacityProvider);



    // Armada App 
    const ECSPolicies = new iam.PolicyDocument({
      statements: [
        // Give ECS Full Access to RDS, Cognito, ECS, EFS, Lambda, Elastic Load Balancing, EC2
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'rds:*',
            'cognito-idp:*',
            'cognito-identity:*',
            'cognito-sync:*',
            'ecs:*',
            'lambda:*',
            'elasticloadbalancing:*',
            'ec2:*',
            'efs:*',
          ],
          resources: ['*'],
        }),

        // Give ECS Tasks Administrator Access
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['iam:PassRole'],
          resources: ['*'],
        }),

        // Allow ECS Tasks to Assume a Role
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: ['*'],
        }),
      ],
    });


    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'Armada-App', {
      executionRole: new iam.Role(this, 'TaskExecutionRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            ManagedPolicies.AmazonECSTaskExecutionRolePolicy
          )
        ],
      }),
      taskRole: new iam.Role(this, 'TaskRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            ManagedPolicies.AmazonECSTaskExecutionRolePolicy
          ),
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            ManagedPolicies.AdministratorAccess
          ),
        ],
        inlinePolicies: {
          ECSPolicies,
        },
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
        AWS_REGION: props.region,
        AWS_IAM_ACCESS_KEY_ID: props.accessKeyId,
        AWS_IAM_SECRET_ACCESS_KEY: props.secretAccessKey,
        DATABASE_URL: `postgresql://postgres:${props.databaseCredentialsSecret
          .secretValueFromJson('password')
          .unsafeUnwrap()}@${props.dbInstance.dbInstanceEndpointAddress}:${
          props.dbInstance.dbInstanceEndpointPort
        }/Armada?schema=public`,
        PORT: '3000',
        USER_POOL_ID: props.cognitoUserPool.userPoolId,
        USER_POOL_WEB_CLIENT_ID: props.cognitoClient.userPoolClientId,
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
      cluster: this.ecs,
      serviceName: 'ArmadaAdminApp',
      taskDefinition,
    });

    // run task
    const runTask = new tasks.EcsRunTask(this, 'Run', {
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      cluster: this.ecs,
      taskDefinition,
      launchTarget: new tasks.EcsEc2LaunchTarget({
        placementStrategies: [
          ecs.PlacementStrategy.spreadAcrossInstances()
        ],
      }),
    });

    const armadaAppTargetGroup = new elbv2.ApplicationTargetGroup(this, 'ArmadaApp',
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
        vpc: props.vpc,
      }
    );

    // Listener 
    this.alb.addListener('ALB-Listener', {
      port: 80, // listens for requests on port 80
      open: true, // Allow CDK to automatically create security group rule to allow traffic on port 80

      protocol: elbv2.ApplicationProtocol.HTTP,

      // Specify the default action for the ALB's Listener on Port 80
      defaultAction: elbv2.ListenerAction.forward([
        armadaAppTargetGroup
      ]),
    });


  }
}