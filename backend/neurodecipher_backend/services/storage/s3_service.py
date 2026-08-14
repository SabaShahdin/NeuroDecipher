import os
import boto3
from botocore.client import Config


s3 = boto3.client(
    "s3",
    region_name=os.getenv("AWS_REGION"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    config=Config(signature_version="s3v4")
)


BUCKET = os.getenv("AWS_BUCKET_NAME")


def generate_upload_url(filename, content_type="application/octet-stream"):

    key = f"uploads/{filename}"

    url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": BUCKET,
            "Key": key,
            "ContentType": content_type
        },
        ExpiresIn=3600
    )

    return {
        "uploadUrl": url,
        "s3Key": key
    }



def download_from_s3(key, local_path):

    s3.download_file(
        BUCKET,
        key,
        local_path
    )

    return local_path
