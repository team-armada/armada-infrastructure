import * as cdk from 'aws-cdk-lib'; 
import * as ec2 from 'aws-cdk-lib/aws-ec2'; 
import * as ssm from 'aws-cdk-lib/aws-ssm'; 

export interface SGStackProps extends cdk.StackProps {}

export class SGStack extends cdk.Stack {
  public vpc: ec2.Vpc; 
  public alb: ec2.SecurityGroup; 
  public launchTemplate: ec2.SecurityGroup; 
  public efs: ec2.SecurityGroup; 

  constructor(scope: cdk.App, id: string, props: SGStackProps) {
    super(scope, id, props);

    const vpcId = ssm.StringParameter.valueFromLookup(this, '/VpcProvider/VPC-Id'); 

    const vpc = ec2.Vpc.fromLookup(this, "VPC", {
      vpcId: vpcId
    }); 


    // Application Load Balancer Security Group 
    this.alb = new ec2.SecurityGroup(this, 'ALB-Security-Group', {
      vpc: vpc,
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
        vpc: vpc,
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



    // EFS Storage Security Group
    this.efs = new ec2.SecurityGroup(
      this,
      'EFSSecurityGroup',
      {
        vpc: vpc,
        description: 'Security Group for the Elastic File System',
        securityGroupName: 'Security Group for Armada Permanent Storage',
      }
    );

    this.efs.connections.allowFrom(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(2049),
      'Allow Network File Storage'
    );

    // Outputs
    new cdk.CfnOutput(this, "ALB-Security-Group-Id", {
      value: this.alb.securityGroupId, 
      description: "The Application Load Balancer's ID", 
      exportName: "ALB-Security-Group-Id"
    });

    new cdk.CfnOutput(this, "Launch-Template-Security-Group-Id", {
      value: this.launchTemplate.securityGroupId, 
      description: "The Launch Template's Security Group Id", 
      exportName: "Launch-Template-Security-Group-Id"
    });

    new cdk.CfnOutput(this, "EFS-Security-Group-Id", {
      value: this.efs.securityGroupId, 
      description: "The EFS Instance Id",
      exportName: "EFS-Security-Group-Id"
    }); 
  }
}