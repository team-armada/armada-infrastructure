import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling'; 


export interface ECSStackProps extends cdk.NestedStackProps {
  vpc: ec2.Vpc; 
  autoScalingGroup: autoscaling.AutoScalingGroup; 
}


export class ECSStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: ECSStackProps) {
    super(scope, id, props);

    // ECS Capacity Provider
    // A capacity provider is an abstraction that uses an ASG underneath
    // It's a way to make your ECS cluster "ASG-aware". 
    // Think ASG adapter for ECS
    const capacityProvider = new ecs.AsgCapacityProvider(
      this,
      'ASG-Capacity-Provider',
      {
        capacityProviderName: 'ASG-Capacity-Provider',
        // manage cluster scaling using ASG strategy
        autoScalingGroup: props.autoScalingGroup,
      }
    );

    const cluster = new ecs.Cluster(this, 'ECS-Cluster', {
      clusterName: 'ECS-Cluster',
      vpc: props.vpc,
      // collect metrics and logs from your containers
      containerInsights: true, // enabled for CloudWatch logs
    });

    // Attach Security group to ECS cluster
    cluster.addAsgCapacityProvider(capacityProvider);
  }
}