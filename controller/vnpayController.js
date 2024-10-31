const express = require("express");
const crypto = require("crypto");
const querystring = require("qs");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const ErrorHandler = require("../utils/ErrorHandler");
const moment = require('moment');
require('dotenv').config(); // Đọc các biến môi trường từ file .env (chỉ hoạt động khi chạy local)

const router = express.Router();

// Tạo URL thanh toán
router.post('/create_payment_url', function (req, res, next) {
    process.env.TZ = 'Asia/Ho_Chi_Minh';
    
    let date = new Date();
    let createDate = moment(date).format('YYYYMMDDHHmmss');
    
    let ipAddr = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // Sử dụng biến môi trường trực tiếp thay cho config.get
    let tmnCode = process.env.VNP_TMNCODE;
    let secretKey = process.env.VNP_HASHSECRET;
    let vnpUrl = process.env.VNP_URL;
    let returnUrl = process.env.VNP_RETURNURL;
    
    // Tạo mã đơn hàng dựa trên thời gian
    let orderId = moment(date).format('DDHHmmss');
    let amount = req.body.amount; // Số tiền từ yêu cầu
    let bankCode = req.body.bankCode; // Mã ngân hàng, nếu có
    
    let locale = req.body.language || 'vn'; // Ngôn ngữ giao diện VNPay
    let currCode = 'VND'; // Loại tiền tệ

    // Tạo các tham số cho VNPay
    let vnp_Params = {
        'vnp_Version': '2.1.0',
        'vnp_Command': 'pay',
        'vnp_TmnCode': tmnCode,
        'vnp_Locale': locale,
        'vnp_CurrCode': currCode,
        'vnp_TxnRef': orderId,
        'vnp_OrderInfo': 'Thanh toan cho ma GD:' + orderId,
        'vnp_OrderType': 'other',
        'vnp_Amount': amount * 100, // Nhân 100 vì đơn vị là VND
        'vnp_ReturnUrl': returnUrl,
        'vnp_IpAddr': ipAddr,
        'vnp_CreateDate': createDate,
    };

    // Nếu có mã ngân hàng, thêm vào
    if (bankCode) {
        vnp_Params['vnp_BankCode'] = bankCode;
    }

    // Sắp xếp các tham số
    vnp_Params = sortObject(vnp_Params);

    // Tạo chữ ký bảo mật (vnp_SecureHash)
    let signData = querystring.stringify(vnp_Params, { encode: false });
    let hmac = crypto.createHmac('sha512', secretKey);
    let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    // Thêm chữ ký vào tham số
    vnp_Params['vnp_SecureHash'] = signed;
    
    // Tạo URL thanh toán
    vnpUrl += '?' + querystring.stringify(vnp_Params, { encode: false });
    
    // Chuyển hướng người dùng đến URL thanh toán của VNPay
    res.status(200).json({
        success: true,
        paymentUrl: vnpUrl,
    });
});

// Xử lý IPN URL
router.get('/vnpay_ipn', function (req, res, next) {
    let vnp_Params = req.query;
    let secureHash = vnp_Params['vnp_SecureHash'];
    
    let orderId = vnp_Params['vnp_TxnRef'];
    let rspCode = vnp_Params['vnp_ResponseCode'];

    // Loại bỏ SecureHash khỏi danh sách tham số để tạo lại chữ ký
    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    vnp_Params = sortObject(vnp_Params);
    let secretKey = process.env.VNP_HASHSECRET;

    let signData = querystring.stringify(vnp_Params, { encode: false });
    let hmac = crypto.createHmac("sha512", secretKey);
    let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");     

    // Kiểm tra chữ ký có khớp không
    if (secureHash === signed) {
        // Kiểm tra tình trạng giao dịch và cập nhật vào cơ sở dữ liệu
        if (rspCode === "00") {
            // Thanh toán thành công
            res.status(200).json({ RspCode: '00', Message: 'Success' });
        } else {
            // Thanh toán thất bại
            res.status(200).json({ RspCode: '01', Message: 'Failed' });
        }
    } else {
        // Chữ ký không khớp
        res.status(200).json({ RspCode: '97', Message: 'Checksum failed' });
    }
});

// Xử lý Return URL
router.get('/vnpay_return', function (req, res, next) {
    let vnp_Params = req.query;

    // Lấy chữ ký bảo mật (SecureHash) từ VNPay trả về
    let secureHash = vnp_Params['vnp_SecureHash'];

    // Xóa SecureHash khỏi tham số để không tính vào việc tạo lại chữ ký
    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    // Sắp xếp các tham số
    vnp_Params = sortObject(vnp_Params);

    let secretKey = process.env.VNP_HASHSECRET;

    // Tạo lại chữ ký từ các tham số nhận được để so sánh với SecureHash từ VNPay
    let signData = querystring.stringify(vnp_Params, { encode: false });
    let hmac = crypto.createHmac("sha512", secretKey);
    let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");     

    // Kiểm tra xem chữ ký có khớp không
    if(secureHash === signed) {
        // Kiểm tra mã phản hồi từ VNPay để xác định giao dịch có thành công không
        res.render('success', {code: vnp_Params['vnp_ResponseCode']});
    } else {
        res.render('success', {code: '97'}); // Chữ ký không khớp
    }
});

// Hàm sắp xếp tham số theo thứ tự alphabet
function sortObject(obj) {
    let sorted = {};
    let str = [];
    let key;
    for (key in obj){
        if (obj.hasOwnProperty(key)) {
            str.push(encodeURIComponent(key));
        }
    }
    str.sort();
    for (key = 0; key < str.length; key++) {
        sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
    }
    return sorted;
}

router.post('/verify_payment', function (req, res) {
    const { orderId, transactionNo, responseCode } = req.body;
  
    // Kiểm tra responseCode xem giao dịch có thành công không
    if (responseCode === '00') {
      // Giao dịch thành công, xử lý lưu vào cơ sở dữ liệu
      console.log(`Giao dịch ${transactionNo} của đơn hàng ${orderId} thành công.`);
      
      // Trả về thành công
      res.status(200).json({ success: true, message: 'Giao dịch thành công' });
    } else {
      // Giao dịch thất bại
      res.status(400).json({ success: false, message: 'Giao dịch thất bại' });
    }
});

module.exports = router;
