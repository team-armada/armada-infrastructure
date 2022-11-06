import { Construct } from 'constructs'; 
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2'; 
import * as ecs from 'aws-cdk-lib/aws-ecs'; 
import * as iam from 'aws-cdk-lib/aws-iam'; 
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling'; 


interface ASGStackProps extends cdk.NestedStackProps {
  vpc: ec2.Vpc; 
  launchTemplateSecurityGroup: ec2.SecurityGroup; 
}


export class ASGStack extends cdk.NestedStack {
  public autoScalingGroup: autoscaling.AutoScalingGroup; 
  public launchTemplate: ec2.LaunchTemplate;

  constructor(scope: Construct, id: string, props: ASGStackProps) {
    super(scope, id, props); 

    this.launchTemplate = new ec2.LaunchTemplate(this, 'ASG-Launch-Template', {
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.SMALL
      ),
      securityGroup: props.launchTemplateSecurityGroup,
      userData: ec2.UserData.forLinux(),
      // grant ec2 instances communication access to ECS cluster
      role: new iam.Role(this, 'ec2AccessRole', {
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      }),
    });

    this.autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'Auto-Scaling-Group', {
      vpc: props.vpc, 
      launchTemplate: this.launchTemplate,
      minCapacity: 1, 
      desiredCapacity: 1, 
      maxCapacity: 10
    }); 
  }
}