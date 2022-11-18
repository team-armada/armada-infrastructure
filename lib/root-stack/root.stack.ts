import { Construct } from 'constructs'; 
import * as cdk from 'aws-cdk-lib';

import { validateEnvVars } from "./root.validation"; 

// Nested Stack
import { VPCStack } from '../vpc/vpc.stack'; 
import { ClusterStack } from '../load-balanced-ecs-cluster/cluster.stack';
import { EFSStack } from "../efs/efs.stack"; 
import { RDSStack } from "../rds/rds.stack"; 
import { AdminNodeStack } from "../rds/admin-node.stack"; 

export interface ArmadaRootStackProps extends cdk.StackProps {
  accessKeyId: string | undefined;
  secretAccessKeyId: string | undefined;
  region: string | undefined;
  availabilityZone: string | undefined;
  keyPairName: string | undefined;
}

export class ArmadaRootStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ArmadaRootStackProps) {
    super(scope, id, props);
    
    validateEnvVars(props); 

    // Virtual Private Cloud
    const infra = new VPCStack(this, "VPC-Stack", {
      description: "VPC and Security Group Stack"
    }); 

    // Armada Cluster 
    const cluster = new ClusterStack(this, "Load-Balanced-Cluster", {
      description: "ECS cluster, application load balancer and auto-scaling group",
      vpc: infra.vpc,
      keyPairName: props.keyPairName,
    }); 

    cluster.addDependency(infra); 

    // File System 
    const fileSystem = new EFSStack(this, "Elastic-File-System", {
      description: "Elastic-File-System", 
      vpc: infra.vpc, 
    })

    fileSystem.addDependency(infra); 

    // Database 
    const database = new RDSStack(this, "RDS-Stack", {
      description: "RDS PostgreSQL Database", 
      vpc: infra.vpc,
      availabilityZone: props.availabilityZone as string
    }); 

    database.addDependency(infra); 

    const adminNode = new AdminNodeStack(this, "Admin-Node-EC2", {
      description: "EC2 instance used for RDS post-installation", 
      vpc: infra.vpc, 
      region: props.region,
      keyPairName: props.keyPairName, 
      availabilityZone: props.availabilityZone
    });

    adminNode.addDependency(database); 

  }
}