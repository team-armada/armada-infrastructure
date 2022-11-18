import { Construct } from 'constructs'; 
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';

export interface ClusterStackProps extends cdk.NestedStackProps {
  readonly vpc: ec2.Vpc; 
  readonly keyPairName: string | undefined; 
}


export class ClusterStack extends cdk.NestedStack {
  public asg: autoscaling.AutoScalingGroup; 
  public ecs: ecs.Cluster; 
  public alb: elbv2.ApplicationLoadBalancer; 

  constructor(scope: Construct, id: string, props?: ClusterStackProps) {
    super(scope, id, props); 

    // Validation 
    if (!props?.vpc) {
      throw new Error('Please provide a reference to the vpc')
    }

    // Application Load Balancer Security Groups
    const albSecurityGroup = new ec2.SecurityGroup(this, 'ALB-Security-Group', {
      vpc: props.vpc,
      description: 'ALB Security Group',
    });

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP Access'
    );

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(80),
      'HTTP Access'
    );

    /**********************************************
     * Launch Template 
    ***********************************************/
    // Launch Template Security Groups
    const ltSecurityGroup = new ec2.SecurityGroup(this, 'Launch-Template-SG', {
        vpc: props.vpc,
        allowAllOutbound: true,
        description: 'Security Group for Launch Template ECS Instances',
      }
    );

    ltSecurityGroup.connections.allowFrom(
      new ec2.Connections({
        securityGroups: [albSecurityGroup],
      }),
      ec2.Port.allTraffic(),
      'Allow all traffic on all ports coming from Application Load Balancer'
    );

    const launchTemplate = new ec2.LaunchTemplate(this, 'ASG-Launch-Template', {
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
      keyName: props.keyPairName,
    });


    /**********************************************
     * Application Load Balancer 
    ***********************************************/
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Load-Balancer', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      loadBalancerName: 'ArmadaLoadBalancer',
    });

    /**********************************************
     * Auto-Scaling Group 
    ***********************************************/
    this.asg = new autoscaling.AutoScalingGroup(this, 'Auto-Scaling-Group', {
      vpc: props.vpc,
      launchTemplate,
      minCapacity: 1,
      desiredCapacity: 1,
      maxCapacity: 10,
    });

    // Scale up based on ECS Memory Reservation for the ECS-Cluster
    this.asg.scaleOnMetric('ScaleUpOnMemoryReservation', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'MemoryReservation',
        dimensionsMap: {
          ClusterName: 'ECS-Cluster',
        },
        statistic: 'Average',
      }),
      // Add 1 instance if memory reservation is greater than 75%
      scalingSteps: [
        {
          lower: 60,
          change: 1,
        },
        // Remove 1 instance if memory reservation is less than 15%
        {
          upper: 15,
          change: -1,
        },
      ],

      adjustmentType: autoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
      cooldown: cdk.Duration.seconds(60),
    });


    /**********************************************
     * ECS
    ***********************************************/
    // ECS Capacity Provider
    // A capacity provider is an abstraction that uses an ASG underneath
    // It's a way to make your ECS cluster "ASG-aware". Think ASG adapter for ECS
    // ECS capacity provider
    const capacityProvider = new ecs.AsgCapacityProvider(
      this,
      'ASG-Capacity-Provider',
      {
        capacityProviderName: 'ASG-Capacity-Provider',
        // manage cluster scaling using ASG strategy
        autoScalingGroup: this.asg,
      }
    );

    this.ecs = new ecs.Cluster(this, 'ECS-Cluster', {
      clusterName: 'ECS-Cluster',
      vpc: props.vpc,
      // collect metrics and logs from your containers
      containerInsights: true, // enabled for CloudWatch logs
    });

    // Attach Security group to ECS cluster
    this.ecs.addAsgCapacityProvider(capacityProvider);
  }
}