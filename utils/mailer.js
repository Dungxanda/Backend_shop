const nodemailer = require("nodemailer");
const pdf = require("html-pdf");
const fs = require("fs");

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: 'phonggiangviet@gmail.com',
    pass: 'kgdl vsbw xvef lrtb',
  },
});

// Hàm định dạng giá tiền
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

// Hàm giới hạn ký tự mô tả
const truncateText = (text, maxLength) => {
  if (text.length > maxLength) {
    return text.substring(0, maxLength) + '...';
  }
  return text;
};

const generateOrderPDF = (orderDetails, callback) => {
  const content = `
    <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
          }
          table {
            font-family: Arial, sans-serif;
            border-collapse: collapse;
            width: 100%;
          }
          th, td {
            border: 1px solid #dddddd;
            text-align: left;
            padding: 8px;
          }
          th {
            background-color: #f2f2f2;
          }
          h2 {
            text-align: center;
          }
        </style>
      </head>
      <body>
        <h2>Chi tiết đơn hàng</h2>
        <p>Tên khách hàng: ${orderDetails.user.name}</p>
        <p>Email: ${orderDetails.user.email}</p>
        <p>Địa chỉ giao hàng: ${orderDetails.shippingAddress.address1}, ${orderDetails.shippingAddress.city}</p>
        <h3>Sản phẩm đã đặt:</h3>
        <table>
          <thead>
            <tr>
              <th>STT</th>
              <th>Tên sản phẩm</th>
              <th>Mô tả</th>
              <th>Số lượng</th>
              <th>Giá</th>
            </tr>
          </thead>
          <tbody>
            ${orderDetails.cart.map((item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${item.name}</td>
                <td>${truncateText(item.description, 50)}</td>
                <td>${item.qty}</td>
                <td>${formatCurrency(item.discountPrice)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <h3>Tổng giá: ${formatCurrency(orderDetails.totalPrice)}</h3>
        <p>Chúc bạn có trải nghiệm mua sắm tuyệt vời!</p>
      </body>
    </html>
  `;

  const options = { format: 'A4' };

  // Tạo PDF từ nội dung HTML
  pdf.create(content, options).toFile(`order-${Date.now()}.pdf`, (err, res) => {
    if (err) return callback(err);
    return callback(null, res.filename);
  });
};

const sendOrderConfirmationEmail = (userEmail, orderDetails) => {
  generateOrderPDF(orderDetails, (err, pdfPath) => {
    if (err) {
      console.log('Error generating PDF:', err);
      return;
    }

    const orderItems = orderDetails.cart.map((item, index) => {
      return `
        <tr>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${index + 1}</td>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${item.name}</td>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${truncateText(item.description, 50)}</td>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${item.qty}</td>
          <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${formatCurrency(item.discountPrice)}</td>
        </tr>`;
    }).join('');

    const mailOptions = {
      from: 'phonggiangviet@gmail.com',
      to: userEmail,
      subject: 'Đặt hàng thành công',
      html: `
        <h2>Đặt hàng thành công</h2>
        <p>Cảm ơn bạn đã đặt hàng. Dưới đây là chi tiết đơn hàng của bạn:</p>
        <table style="font-family: Arial, sans-serif; border-collapse: collapse; width: 100%;">
          <thead>
            <tr>
              <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">STT</th>
              <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Tên sản phẩm</th>
              <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Mô tả</th>
              <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Số lượng</th>
              <th style="border: 1px solid #dddddd; text-align: left; padding: 8px;">Giá</th>
            </tr>
          </thead>
          <tbody>
            ${orderItems}
          </tbody>
        </table>
        <h3>Tổng giá: ${formatCurrency(orderDetails.totalPrice)}</h3>
        <p>Địa chỉ giao hàng: ${orderDetails.shippingAddress.address1}, ${orderDetails.shippingAddress.city}</p>
        <p>Chúc bạn có trải nghiệm mua sắm tuyệt vời!</p>
      `,
      attachments: [
        {
          filename: pdfPath.split('/').pop(),
          path: pdfPath,
          contentType: 'application/pdf',
        },
      ],
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
        // Xóa file PDF sau khi gửi email
        fs.unlinkSync(pdfPath);
      }
    });
  });
};

module.exports = sendOrderConfirmationEmail;
