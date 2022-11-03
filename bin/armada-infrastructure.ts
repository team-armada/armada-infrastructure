#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VPCStack } from '../lib/vpc-stack';
import { AutoScalingStack } from "../lib/autoscaling-stack"; 
import { ALBStack } from "../lib/application-load-balancer-stack"; 
import { SGStack } from "../lib/security-groups-stack"; 
import { ECSStack } from "../lib/ecs-stack"; 
import { EFSStack } from "../lib/efs-stack"; 
import { RDSStack } from "../lib/rds-stack"; 
import { CognitoStack } from "../lib/cognito-stack"; 

const app = new cdk.App();

// eslint-disable-next-line @typescript-eslint/no-unused-vars

// VPC Stack
const infra = new VPCStack(app, 'VPC-Stack', {
  stackName: "VPC-Stack", 
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
}); 

// Security Groups Stack
const sg = new SGStack(app, 'Security-Groups', {
  vpc: infra.vpc
}); 

// Auto Scaling Group Stack
const asg = new AutoScalingStack(app, 'Auto-Scaling-Group', {
  vpc: infra.vpc,
  albSecurityGroup: sg.alb, 
});

// Application Load Balancer Stack
const alb = new ALBStack(app, 'Application-Load-Balancer', {
  vpc: infra.vpc, 
  albSecurityGroup: sg.alb,
  autoScalingGroup: asg.autoScalingGroup
}); 

// ECS Cluster Stack
const ecs = new ECSStack(app, 'ECS-Cluster', {
  vpc: infra.vpc,
  autoScalingGroup: asg.autoScalingGroup
});


// Elastic File System 
const efs = new EFSStack(app, 'Elastic-File-System', {
  vpc: infra.vpc,
  efsSecurityGroup: sg.efs
}); 

// Cognito
const cognito = new CognitoStack(app, 'Cognito-User-Pool', {}); 


// RDS (Database)
const rds = new RDSStack(app, 'RDS-Database', {
  rdsSecurityGroup: sg.rds
});


// Single Page App Construct 
// const spa = new SPAStack(app, 'Single-Page-App', {

// }); 


app.synth()









// const stack = new ArmadaInfrastructureStack(app, 'ArmadaInfrastructureStack', {
//   env: {
//     account: process.env.CDK_DEFAULT_ACCOUNT,
//     region: process.env.CDK_DEFAULT_REGION,
//   },
// });
