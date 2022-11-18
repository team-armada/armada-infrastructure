import * as cdk from 'aws-cdk-lib'; 
import * as ec2 from 'aws-cdk-lib/aws-ec2'; 
import { Construct } from 'constructs'; 

export interface VPCStackProps extends cdk.NestedStackProps {}

export class VPCStack extends cdk.NestedStack {
  public vpc: ec2.Vpc; 

  constructor(scope: Construct, id: string, props?: VPCStackProps) {
    super(scope, id, props); 

    this.vpc = new ec2.Vpc(this, "VPC-Stack", {
      cidr: '10.0.0.0/16',
      maxAzs: 3,
      subnetConfiguration: [
        {
          name: 'publicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
      natGateways: 0,
    });

  }
}