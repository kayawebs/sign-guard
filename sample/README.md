# 全文识别高精版完整工程示例

该项目为RecognizeAdvanced的完整工程示例。

该示例**无法在线调试**，如需调试可下载到本地后替换 [AK](https://usercenter.console.aliyun.com/#/manage/ak) 以及参数后进行调试。

## 运行条件

- 下载并解压需要语言的代码;


- 在阿里云帐户中获取您的 [凭证](https://usercenter.console.aliyun.com/#/manage/ak) 并通过它替换下载后代码中的 ACCESS_KEY_ID 以及 ACCESS_KEY_SECRET;

- 执行对应语言的构建及运行语句

## 执行步骤

下载的代码包，在根据自己需要更改代码中的参数和 AK 以后，可以在**解压代码所在目录下**按如下的步骤执行：

- *Node.js >= 8.x*
```sh
npm install --registry=https://registry.npmmirror.com && tsc && node ./dist/client.js
```
## 使用的 API

-  RecognizeAdvanced：支持多格式版面、复杂文档背景和光照环境的精准识别，可实现印章擦除后识别，支持低置信度过滤、图案检测等高阶功能。 更多信息可参考：[文档](https://next.api.aliyun.com/document/ocr-api/2021-07-07/RecognizeAdvanced)

## API 返回示例

*实际输出结构可能稍有不同，属于正常返回；下列输出值仅作为参考，以实际调用为准*


- JSON 格式 
```js
{
  "RequestId": "43A29C77-405E-4CC0-BC55-EE694AD00655",
  "Data": "{ \t\"content\": \"2017年河北区实验小学\", \t\"height\": 3509, \t\"orgHeight\": 3509, \t\"orgWidth\": 2512, \t\"prism_version\": \"1.0.9\", \t\"prism_wnum\": 126, \t\"prism_wordsInfo\": [{ \t\t\"angle\": -89, \t\t\"direction\": 0, \t\t\"height\": 541, \t\t\"pos\": [{ \t\t\t\"x\": 982, \t\t\t\"y\": 223 \t\t}, { \t\t\t\"x\": 1522, \t\t\t\"y\": 223 \t\t}, { \t\t\t\"x\": 1522, \t\t\t\"y\": 266 \t\t}, { \t\t\t\"x\": 982, \t\t\t\"y\": 266 \t\t}], \t\t\"prob\": 99, \t\t\"width\": 43, \t\t\"word\": \"2017年河北区实验小学\", \t\t\"x\": 1230, \t\t\"y\": -26 \t}], \t\"width\": 2512 }",
  "Code": "noPermission",
  "Message": "You are not authorized to perform this operation."
}
```

