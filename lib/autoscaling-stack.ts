import * as cdk from 'aws-cdk-lib'; 
import * as ec2 from 'aws-cdk-lib/aws-ec2'; 
import * as ecs from 'aws-cdk-lib/aws-ecs'; 
import * as iam from 'aws-cdk-lib/aws-iam'; 
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling'; 


export interface AutoScalingStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  albSecurityGroup: ec2.SecurityGroup;
}

export class AutoScalingStack extends cdk.Stack {
  public vpc: ec2.Vpc; 
  public albSecurityGroup: ec2.SecurityGroup; 
  public launchTemplate: ec2.LaunchTemplate; 
  public autoScalingGroup: autoscaling.AutoScalingGroup; 

  constructor(scope: cdk.App, id: string, props: AutoScalingStackProps) {
    super(scope, id, props);

    // Launch Template Security Groups
    const ltSecurityGroup = new ec2.SecurityGroup(this, 'Launch-Template-SG', {
        vpc: props?.vpc,
        allowAllOutbound: true,
        description: 'Security Group for Launch Template ECS Instances',
      }
    );

    ltSecurityGroup.connections.allowFrom(
      new ec2.Connections({
        securityGroups: [props?.albSecurityGroup],
      }),
      ec2.Port.allTraffic(),
      'Allow all traffic on all ports coming from Application Load Balancer'
    );

    this.launchTemplate = new ec2.LaunchTemplate(this, 'ASG-Launch-Template', {
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.SMALL
      ),
      securityGroup: ltSecurityGroup,
      userData: ec2.UserData.forLinux(),
      // grant ec2 instances communication access to ECS cluster
      role: new iam.Role(this, 'ec2AccessRole', {
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      }),
    });

    this.autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'Auto-Scaling-Group', {
      vpc: props?.vpc, 
    })
  }
}

