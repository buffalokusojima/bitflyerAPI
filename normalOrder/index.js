const axios = require('axios');
const crypto = require('crypto');
const API_KEY = process.env["BitFlyerApiKey"];
const SECRET_KEY = process.env["BitFlyerSecretKey"];

exports.handler = async (event, context, callback) => {
    
    let body = JSON.parse(event.Records[0].body);
    
    if(!body){
        console.log("Queue Empty");
        callback(null, makeResponse(
                400,
                {message: "Queue Empty"}
            )
        );
        return;
    }
    
    console.log(body);
    
    if(!body.child_order_type){
        console.log("element invalid");
        callback(null, makeResponse(
                400,
                {message: "element invalid"}
            )
        );
        return;
    }

    const timestamp = Date.now().toString();
    const method = 'POST';
    const path = '/v1/me/sendchildorder';

    body = JSON.stringify(body);
        
    const text = timestamp + method + path + body;
    const sign = crypto.createHmac('sha256', SECRET_KEY).update(text).digest('hex');
    
    const option = {
        url: 'https://api.bitflyer.com' + path,
        method: method,
        headers: {
            'ACCESS-KEY': API_KEY,
            'ACCESS-TIMESTAMP': timestamp,
            'ACCESS-SIGN': sign,
            'Content-Type': 'application/json'
        },
        data: body
    };
    let data;
    try{
        data = await axios(option);
        console.log(data);
    }catch(err){
        console.log(err);
        callback(null, makeResponse(
                err.status,
                {message: err.response.data}
            )
        );
        return;
    }
    
    let message;
    if(data.status == 200){
        message = data.body;
    }else{
        message = data.response;
    }
    console.log(message);
    callback(null, makeResponse(
            data.status,
            {message: message}
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