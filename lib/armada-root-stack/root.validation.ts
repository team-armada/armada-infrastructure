import { ArmadaRootStackProps } from "./root.stack";

export const validateEnvVars = (props: ArmadaRootStackProps) => {
  if (!props?.accessKeyId) {
    throw new Error(
      'Please set your access key in the environmental variables using: AWS_ACCESS_KEY_ID.'
    );
  }

  if (!props?.secretAccessKeyId) {
    throw new Error(
      'Please set your secret key in the environmental variables using: AWS_SECRET_ACCESS_KEY.'
    );
  }

  if (!props?.region) {
    throw new Error(
      'Please set your default region in the environmental variables using: AWS_DEFAULT_REGION.'
    );
  }

  if (!props?.availabilityZone) {
    throw new Error(
      'Please set your default availability zone in the environmental variables using: AWS_AVAILABILITY_ZONE.'
    );
  }

  if (!props?.keyPairName) {
    throw new Error(
      'Please set a default key pair to be used with admin node that manages RDS using: ADMIN_NODE_KEY_PAIR_NAME.'
    );
  }
}; 