import { Construct } from 'constructs'; 
import * as cdk from 'aws-cdk-lib';

// Nested Stack
import { VPCStack } from './vpc-nested-stack';
import { EFSStack } from './efs-stack';
import { CognitoStack } from './cognito-stack';
import { ASGStack } from './asg-stack';
import { ALBStack } from "./load-balancer-stack";
import { ECSStack } from "./ecs-stack";
import { RDSStack } from "./rds-stack";


export class ArmadaRootStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC and SGs
    const infra = new VPCStack(this, "VPC-Stack", {
      description: "VPC and Security Groups stack"
    }); 


    // File System 
    const efs = new EFSStack(this, "EFS-Stack", {
      vpc: infra.vpc,
      efsSecurityGroup: infra.efsSecurityGroup
    });

    efs.addDependency(infra); 


    // Auto Scaling Group 
    const asg = new ASGStack(this, "ASG-Stack", {
      vpc: infra.vpc,
      launchTemplateSecurityGroup: infra.launchTemplateSecurityGroup
    }); 

    asg.addDependency(infra); 

    // Load Balancer 
    const loadBalancer = new ALBStack(this, "ALB-Stack", {
      vpc: infra.vpc,
      albSecurityGroup: infra.albSecurityGroup,
      autoScalingGroup: asg.autoScalingGroup
    }); 

    loadBalancer.addDependency(asg); 


    // ECS Cluster 
    const ecs = new ECSStack(this, 'ECS-Stack', {
      vpc: infra.vpc, 
      autoScalingGroup: asg.autoScalingGroup
    }); 

    ecs.addDependency(asg); 


    // Cognito 
    const cognito = new CognitoStack(this, "Cognito-Stack", {}); 


    // RDS Database 
    const rds = new RDSStack(this, "RDS-Stack", {
      vpc: infra.vpc, 
      rdsSecurityGroup: infra.rdsSecurityGroup
    }); 

    rds.addDependency(infra); 
  }
}