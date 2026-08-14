import os
import boto3

s3 = boto3.client(
    "s3",
    region_name=os.getenv("AWS_REGION"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
)

bucket = os.getenv("AWS_BUCKET_NAME")

print("Bucket:", bucket)

response = s3.list_objects_v2(Bucket=bucket)

print("Connection successful!")

print(response.get("KeyCount", 0), "objects found")
