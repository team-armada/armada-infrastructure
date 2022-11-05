import * as cdk from 'aws-cdk-lib'; 
import * as ec2 from 'aws-cdk-lib/aws-ec2'; 
import * as ecs from 'aws-cdk-lib/aws-ecs'; 
import * as iam from 'aws-cdk-lib/aws-iam'; 
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling'; 
import * as ssm from 'aws-cdk-lib/aws-ssm'; 


export interface AutoScalingStackProps extends cdk.StackProps {}

export class AutoScalingStack extends cdk.Stack {
  public vpc: ec2.Vpc; 
  public launchTemplateSecurityGroup: ec2.SecurityGroup; 
  private launchTemplate: ec2.LaunchTemplate; 
  public autoScalingGroup: autoscaling.AutoScalingGroup; 

  constructor(scope: cdk.App, id: string, props: AutoScalingStackProps) {
    super(scope, id, props);

    const vpcId = ssm.StringParameter.valueFromLookup(this, '/VpcProvider/VPC-Id'); 
    const vpc = ec2.Vpc.fromLookup(this, "VPC", {
      vpcId: vpcId
    })

  
    const launchTemplateSecurityGroup = ec2.SecurityGroup.fromLookupById(
      this,
      'Launch-Template-Security-Group',
      cdk.Fn.importValue('Launch-Template-Security-Group-Id'),
    );

    this.launchTemplate = new ec2.LaunchTemplate(this, 'ASG-Launch-Template', {
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.SMALL
      ),
      securityGroup: launchTemplateSecurityGroup,
      userData: ec2.UserData.forLinux(),
      // grant ec2 instances communication access to ECS cluster
      role: new iam.Role(this, 'ec2AccessRole', {
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      }),
    });

    this.autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'Auto-Scaling-Group', {
      vpc: vpc, 
      launchTemplate: this.launchTemplate,
      minCapacity: 1, 
      desiredCapacity: 1, 
      maxCapacity: 10
    })
  }
}

