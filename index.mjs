"use strict";
import querystring from "querystring";
import Sharp from "sharp";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const S3 = new S3Client({ region: "ap-northeast-2" });
const BUCKET = "nemo-erp-dev";

// streamToBuffer 함수를 추가합니다.
const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

export const handler = async (event, context, callback) => {
  const { request, response } = event.Records[0].cf;
  const params = querystring.parse(request.querystring);

  if (!params.w && !params.h) {
    return callback(null, response);
  }

  const { uri } = request;
  const [, imageName, extension] = uri.match(/\/?(.*)\.(.*)/);

  if (extension === "gif" && !params.f) {
    return callback(null, response);
  }

  let width = parseInt(params.w, 10) || null;
  let height = parseInt(params.h, 10) || null;
  let quality = parseInt(params.q, 10) || 80; // NaN이면 기본값으로 80을 설정
  let format = params.f ? params.f : extension;
  format = format === "jpg" ? "jpeg" : format;

  console.log(`params: ${JSON.stringify(params)}`);
  console.log(`name: ${imageName}.${extension}`);

  try {
    const getObjectParams = {
      Bucket: BUCKET,
      Key: decodeURI("bus/image/" + imageName + "." + extension),
    };
    const command = new GetObjectCommand(getObjectParams);
    const data = await S3.send(command);

    const bodyBuffer = await streamToBuffer(data.Body);

    let resizedImage = await Sharp(bodyBuffer)
      .resize(width, height)
      .toFormat(format, { quality })
      .toBuffer();

    const resizedImageByteLength = Buffer.byteLength(resizedImage, "base64");
    console.log("byteLength: ", resizedImageByteLength);

    if (resizedImageByteLength >= 1 * 1024 * 1024) {
      return callback(null, response);
    }

    response.status = 200;
    response.body = resizedImage.toString("base64");
    response.bodyEncoding = "base64";
    response.headers["content-type"] = [
      { key: "Content-Type", value: `image/${format}` },
    ];

    return callback(null, response);
  } catch (error) {
    console.error("Error: ", error);
    return callback(error);
  }
};
