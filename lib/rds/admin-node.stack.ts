import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { readFileSync } from 'fs';

import * as rds from 'aws-cdk-lib/aws-rds';
import * as path from 'path';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { CfnParameter, Duration } from 'aws-cdk-lib';
import { PolicyDocument } from 'aws-cdk-lib/aws-iam';

import { ManagedPolicies } from '../../utils/policies';
const userDataScript = readFileSync('./user-data.sh', 'utf8');

export interface AdminNodeStackProps extends cdk.NestedStackProps {
  readonly vpc: ec2.Vpc; 
  readonly region: string | undefined; 
  readonly keyPairName: string | undefined; 
  readonly availabilityZone: string | undefined; 
}


export class AdminNodeStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props?: AdminNodeStackProps) {
    super(scope, id, props); 

    if (!props?.vpc) {
      throw new Error('Please provide a reference to the vpc');
    }

    // AdminNode Security Group
    const adminNodeSecurityGroup = new ec2.SecurityGroup(this, 'ec2-rds-1', {
      description: 'The security group for the admin node',
      vpc: props.vpc,
    });

    adminNodeSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH access'
    );

    // Secrets manager
    const adminNodeRole = new iam.Role(this, 'Admin-Node-Access-Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com', {
        region: props.region,
      }),
      description: 'Allow EC2 to access AWS Secrets Manager and RDS',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          ManagedPolicies.SecretsManagerReadWrite
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          ManagedPolicies.AmazonRDSFullAccess
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          ManagedPolicies.AmazonCognitoPowerUser
        ),
      ],
    });

    

    const adminNode = new ec2.Instance(this, 'Armada-AdminNode', {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.SMALL
      ),
      role: adminNodeRole,
      availabilityZone: props.availabilityZone,
      securityGroup: adminNodeSecurityGroup,
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      keyName: props.keyPairName,
    });

    adminNode.addUserData(userDataScript);
  }
}