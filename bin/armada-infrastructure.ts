#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ArmadaRootStack } from "../lib/armada-root-stack"; 

const app = new cdk.App();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
new ArmadaRootStack(app, "Armada-Root-Stack", {
  stackName: "Armada-Root-Stack",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});





// VPC Stack
// const infra = new VPCStack(app, 'VPC', {
//   stackName: "VPC-Stack", 
//   env: {
//     account: process.env.CDK_DEFAULT_ACCOUNT,
//     region: process.env.CDK_DEFAULT_REGION,
//   },
// }); 


// // Security Groups Stack
// const sg = new SGStack(app, 'Security-Groups', {
//   stackName: "Security-Group-Stack", 
//   env: {
//     account: process.env.CDK_DEFAULT_ACCOUNT,
//     region: process.env.CDK_DEFAULT_REGION,
//   },
// }); 

// // guarantee infra will be created first 
// sg.addDependency(infra); 



// Auto Scaling Group Stack
// const asg = new AutoScalingStack(app, 'Auto-Scaling-Group', {
//   stackName: "Auto-Scaling-Group-Stack", 
//   env: {
//     account: process.env.CDK_DEFAULT_ACCOUNT,
//     region: process.env.CDK_DEFAULT_REGION,
//   },
// });

// // Application Load Balancer Stack
// const alb = new ALBStack(app, 'Application-Load-Balancer', {
//   vpc: infra.vpc, 
//   albSecurityGroup: sg.alb,
//   autoScalingGroup: asg.autoScalingGroup
// }); 

// // ECS Cluster Stack
// const ecs = new ECSStack(app, 'ECS-Cluster', {
//   vpc: infra.vpc,
//   autoScalingGroup: asg.autoScalingGroup
// });

// // Elastic File System 
// const efs = new EFSStack(app, 'Elastic-File-System', {
//   vpc: infra.vpc,
//   efsSecurityGroup: sg.efs
// }); 

// // Cognito
// const cognito = new CognitoStack(app, 'Cognito-User-Pool', {}); 


// RDS (Database)
// const rds = new RDSStack(app, 'RDS-Database', {
//   rdsSecurityGroup: sg.rds
// });


// Single Page App Construct 
// const spa = new SPAStack(app, 'Single-Page-App', {

// }); 

// app.synth(); 


// const stack = new ArmadaInfrastructureStack(app, 'ArmadaInfrastructureStack', {
//   env: {
//     account: process.env.CDK_DEFAULT_ACCOUNT,
//     region: process.env.CDK_DEFAULT_REGION,
//   },
// });
