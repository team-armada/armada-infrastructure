import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';


import * as path from 'path';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { CfnParameter, Duration } from 'aws-cdk-lib';
import { readFileSync } from 'fs';
import { PolicyDocument } from 'aws-cdk-lib/aws-iam';




export interface ArmadaAppStackProps extends cdk.NestedStackProps {
  readonly vpc: ec2.Vpc; 
}


export class ArmadaAppStack extends cdk.NestedStack {
  public efsSecurityGroup: ec2.SecurityGroup; 
  public efs: efs.FileSystem; 
  public lambdaEFSAccessPoint: efs.AccessPoint;
  public lambdaAccessRole: iam.Role;
  public storageLambda: lambda.Function;

  constructor(scope: Construct, id: string, props?: ArmadaAppStackProps) {
    super(scope, id, props); 

    // Validation 
    if (!props?.vpc) {
      throw new Error('Please provide a reference to the vpc')
    }


    const ECSPolicies = new PolicyDocument({
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
            'service-role/AmazonECSTaskExecutionRolePolicy'
          ),
        ],
      }),
      taskRole: new iam.Role(this, 'TaskRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AmazonECSTaskExecutionRolePolicy'
          ),
          iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
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
        AWS_IAM_SECRET_ACCESS_KEY: props.secretAccessKeyId,
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