import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib'; 
import * as ec2 from 'aws-cdk-lib/aws-ec2'; 
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';


interface ALBStackProps extends cdk.NestedStackProps {
  vpc: ec2.Vpc;
  albSecurityGroup: ec2.SecurityGroup; 
  autoScalingGroup: autoscaling.AutoScalingGroup;
}


export class ALBStack extends cdk.NestedStack {
  public vpc: ec2.Vpc;
  public alb: elbv2.ApplicationLoadBalancer; 
  public albListener: autoscaling.AutoScalingGroup;

  constructor(scope: Construct, id: string, props: ALBStackProps) {
    super(scope, id, props);

    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Load-Balancer', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSecurityGroup,
    });

    // TODO: eventually we want to use port 443 and HTTPS
    const albListener = this.alb.addListener('ALB-Listener', {
      port: 80, // listens for requests on port 80
      open: true, // Allow CDK to automatically create security
      // group rule to allow traffic on port 80
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    // When you add an autoscaling group as the target
    // CDK automatically puts the instances associated with that ASG into a target group
    albListener.addTargets('Target-Group-ASG', {
      port: 80,
      // send traffic to automatically created Target Group
      // that contains any instance created by Auto Scaling Group
      targets: [props.autoScalingGroup],
      healthCheck: {
        enabled: true,
        healthyHttpCodes: '200-299',
        path: '/',
      },
    });
  }
}