import * as cdk from 'aws-cdk-lib'; 
import * as ec2 from 'aws-cdk-lib/aws-ec2'; 
import { Construct } from 'constructs'; 

export class VPCStack extends cdk.NestedStack {
  public readonly vpc: ec2.Vpc;
  public readonly albSecurityGroup: ec2.SecurityGroup; 
  public readonly launchTemplateSecurityGroup: ec2.SecurityGroup; 
  public readonly efsSecurityGroup: ec2.SecurityGroup; 

  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'VPC', {
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

    // Application Load Balancer Security Group 
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'ALB-Security-Group', {
      vpc: this.vpc,
      description: 'ALB Security Group',
    });

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP Access'
    );

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(80),
      'HTTP Access'
    );

    // Launch Template Security Groups
    this.launchTemplateSecurityGroup = new ec2.SecurityGroup(this , 'Launch-Template-SG', {
        vpc: this.vpc,
        allowAllOutbound: true,
        description: 'Security Group for Launch Template ECS Instances',
      }
    );

    this.launchTemplateSecurityGroup.connections.allowFrom(
      new ec2.Connections({
        securityGroups: [this.albSecurityGroup],
      }),
      ec2.Port.allTraffic(),
      'Allow all traffic on all ports coming from Application Load Balancer'
    );



    // EFS Storage Security Group
    this.efsSecurityGroup = new ec2.SecurityGroup(
      this,
      'EFSSecurityGroup',
      {
        vpc: this.vpc,
        description: 'Security Group for the Elastic File System',
        securityGroupName: 'Security Group for Armada Permanent Storage',
      }
    );

    this.efsSecurityGroup.connections.allowFrom(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(2049),
      'Allow Network File Storage'
    );


    // RDS 


  }
}