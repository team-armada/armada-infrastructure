#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VPCStack } from '../lib/vpc-stack';
import { AutoScalingStack } from "../lib/autoscaling-stack"; 

const app = new cdk.App();

// eslint-disable-next-line @typescript-eslint/no-unused-vars

// VPC 
const infra = new VPCStack(app, 'VPC-Stack', {
  stackName: "VPC-Stack", 
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
}); 

// Application Load Balancer 

// Auto Scaling Group 
const asg = new AutoScalingStack(app, 'Auto-Scaling-Group', {
  vpc: infra.vpc,
  albSecurityGroup: alb.securityGroup
})

// ECS Cluster 

// LAMBDAS

// Elastic File System 

// Cognito 

// RDS (Database)

// Single Page App Construct 









// const stack = new ArmadaInfrastructureStack(app, 'ArmadaInfrastructureStack', {
//   env: {
//     account: process.env.CDK_DEFAULT_ACCOUNT,
//     region: process.env.CDK_DEFAULT_REGION,
//   },
// });
