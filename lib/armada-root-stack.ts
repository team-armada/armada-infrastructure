import { Construct } from 'constructs'; 
import * as cdk from 'aws-cdk-lib';

// Nested Stack
import { VPCStack } from './vpc-nested-stack';
import { EFSStack } from './efs-stack';



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
    })

    efs.addDependency(infra); 

    // Load Balancer 
    

  }
}