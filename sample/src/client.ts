// This file is auto-generated, don't edit it
// 依赖的模块可通过下载工程中的模块依赖文件或右上角的获取 SDK 依赖信息查看
import ocr_api20210707, * as $ocr_api20210707 from '@alicloud/ocr-api20210707';
import OpenApi, * as $OpenApi from '@alicloud/openapi-client';
import Console from '@alicloud/tea-console';
import Util, * as $Util from '@alicloud/tea-util';
import Credential from '@alicloud/credentials';
import * as $tea from '@alicloud/tea-typescript';


export default class Client {

  /**
   * @remarks
   * 使用凭据初始化账号Client
   * @returns Client
   * 
   * @throws Exception
   */
  static createClient(): ocr_api20210707 {
    // 工程代码建议使用更安全的无AK方式，凭据配置方式请参见：https://help.aliyun.com/document_detail/378664.html。
    let credential = new Credential();
    let config = new $OpenApi.Config({
      credential: credential,
    });
    // Endpoint 请参考 https://api.aliyun.com/product/ocr-api
    config.endpoint = `ocr-api.cn-hangzhou.aliyuncs.com`;
    return new ocr_api20210707(config);
  }

  static async main(args: string[]): Promise<void> {
    let client = Client.createClient();
    let recognizeAdvancedRequest = new $ocr_api20210707.RecognizeAdvancedRequest({
      url: "https://jfmshu.oss-cn-shanghai.aliyuncs.com/contracts/e7b17707-7234-4e65-b75e-24c6b490d584-shu.png?Expires=1764470401&OSSAccessKeyId=TMP.3KodoCqcHKb2nehCpStAZBEXQFPHTsGovpHvMYkuNXYktBVuNAkZEYW8gcSFYFTq9YqGjj2ck1bD7ctPoyEQwWmyGTjjWH&Signature=Tjl63PY6NlyAvOzFmyN%2BAGn1RH8%3D",
    });
    let runtime = new $Util.RuntimeOptions({ });
    try {
      let resp = await client.recognizeAdvancedWithOptions(recognizeAdvancedRequest, runtime);
      Console.log(Util.toJSONString(resp));
    } catch (error) {
      // 此处仅做打印展示，请谨慎对待异常处理，在工程项目中切勿直接忽略异常。
      // 错误 message
      console.log(error.message);
      // 诊断地址
      console.log(error.data["Recommend"]);
      Util.assertAsString(error.message);
    }    
  }

}

Client.main(process.argv.slice(2));