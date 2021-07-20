const axios = require('axios');
const crypto = require('crypto');
const API_KEY = process.env["BitFlyerApiKey"];
const SECRET_KEY = process.env["BitFlyerSecretKey"];

exports.handler = async (event, context, callback) => {
    
    let returnData;
        
    let timestamp = Date.now().toString();
    let method = 'GET';
    let path = '/v1/me/getparentorders?product_code=FX_BTC_JPY&parent_order_state=ACTIVE';
    
    let text = timestamp + method + path;
    let sign = crypto.createHmac('sha256', SECRET_KEY).update(text).digest('hex');
    
    let option = {
      url: 'https://api.bitflyer.jp' + path,
      method: method,
      headers: {
        'ACCESS-KEY': API_KEY,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-SIGN': sign,
        'Content-Type': 'application/json'
        }
    };
        
    let data = await axios(option);
    
    if(data.status != 200){
      console.error("Error:",data.response);
      callback(null, makeResponse(
        data.status,
        {message: data.response})
      );
      return;
    }
    
    data = data.data;
        
    console.log("Parent Oreders:", data);
    
    returnData = data;
    
    timestamp = Date.now().toString();
    method = 'GET';
    path = '/v1/me/getchildorders?product_code=FX_BTC_JPY&child_order_state=ACTIVE';
    
    text = timestamp + method + path;
    sign = crypto.createHmac('sha256', SECRET_KEY).update(text).digest('hex');
    
    option = {
      url: 'https://api.bitflyer.jp' + path,
      method: method,
      headers: {
        'ACCESS-KEY': API_KEY,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-SIGN': sign,
        'Content-Type': 'application/json'
        }
    };
        
    data = await axios(option);
    
    if(data.status != 200){
        console.error("Error:",data.response);
        callback(null, makeResponse(
            data.status,
            {message: data.response})
        );
      return;
    }
    
    data = data.data;
    
    console.log("Child Orders:",data);
        
    returnData = returnData.concat(data);
    if(returnData.length == 0){
        console.log('No data Found');
        callback(null,makeResponse(
            200,
            {message: 'No data Found'})
        );
        return;
    }
    callback(null,makeResponse(
            200,
            {data: returnData}
        )
    );
    return;
};

const makeResponse = (statusCode, body) => {
    return {
        statusCode: statusCode,
        body: JSON.stringify(body),
        headers: {
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS"
        }
    };
};