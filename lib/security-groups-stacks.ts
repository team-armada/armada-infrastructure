import * as cdk from 'aws-cdk-lib'; 
import * as ec2 from 'aws-cdk-lib/aws-ec2'; 

export interface SGStackProps extends cdk.StackProps {
  vpc: ec2.Vpc; 
}

export class SGStack extends cdk.Stack {
  public vpc: ec2.Vpc; 
  public alb: ec2.SecurityGroup; 
  public launchTemplate: ec2.SecurityGroup; 
  public efs: ec2.SecurityGroup; 

  constructor(scope: cdk.App, id: string, props: SGStackProps) {
    super(scope, id, props);

    // Application Load Balancer Security Group 
    this.alb = new ec2.SecurityGroup(this, 'ALB-Security-Group', {
      vpc: props.vpc,
      description: 'ALB Security Group',
    });

    this.alb.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP Access'
    );

    this.alb.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(80),
      'HTTP Access'
    );

    // Launch Template Security Groups
    this.launchTemplate = new ec2.SecurityGroup(this , 'Launch-Template-SG', {
        vpc: props.vpc,
        allowAllOutbound: true,
        description: 'Security Group for Launch Template ECS Instances',
      }
    );

    this.launchTemplate.connections.allowFrom(
      new ec2.Connections({
        securityGroups: [this.alb],
      }),
      ec2.Port.allTraffic(),
      'Allow all traffic on all ports coming from Application Load Balancer'
    );

    // Security Group for Storage
    this.efs = new ec2.SecurityGroup(
      this,
      'EFSSecurityGroup',
      {
        vpc: props.vpc,
        description: 'Security Group for the Elastic File System',
        securityGroupName: 'Security Group for Armada Permanent Storage',
      }
    );

    // RDS Security Group 


  }
}