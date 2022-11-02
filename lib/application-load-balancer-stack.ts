import * as cdk from 'aws-cdk-lib'; 
import * as ec2 from 'aws-cdk-lib/aws-ec2'; 

interface ALBStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class ALBStack extends cdk.Stack {
  public vpc: ec2.Vpc;
  public securityGroup: ec2.SecurityGroup; 

  constructor(scope: cdk.App, id: string, props: ALBStackProps) {
    super(scope, id, props);

    // Security Group 
    this.securityGroup = new ec2.SecurityGroup(this, 'ALB-Security-Group', {
      vpc: props.vpc,
      description: 'ALB Security Group',
    });

    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP Access'
    );

    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(80),
      'HTTP Access'
    );
  }
}