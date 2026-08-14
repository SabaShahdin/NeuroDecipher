import os
import boto3


s3 = boto3.client(
    "s3",
    region_name=os.getenv("AWS_REGION"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
)


def download_file_from_s3(s3_key: str, local_path: str):
    """
    Downloads an object from S3 to a local file.
    """

    bucket = os.getenv("AWS_BUCKET_NAME")

    os.makedirs(os.path.dirname(local_path), exist_ok=True)

    s3.download_file(
        bucket,
        s3_key,
        local_path,
    )

    return local_path
