const express = require("express");
const router = express.Router();
const ErrorHandler = require("../utils/ErrorHandler");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const { isAuthenticated, isSeller, isAdmin } = require("../middleware/auth");
const Order = require("../model/order");
const Shop = require("../model/shop");
const Product = require("../model/product");
const sendOrderConfirmationEmail = require("../utils/mailer");

// create new order
router.post(
  "/create-order",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const { cart, shippingAddress, user, totalPrice, paymentInfo } = req.body;

      console.log("check mail: ", user.email);

      //   group cart items by shopId
      const shopItemsMap = new Map();

      for (const item of cart) {
        const shopId = item.shopId;
        if (!shopItemsMap.has(shopId)) {
          shopItemsMap.set(shopId, []);
        }
        shopItemsMap.get(shopId).push(item);
      }

      // create an order for each shop
      const orders = [];

      for (const [shopId, items] of shopItemsMap) {
        const order = await Order.create({
          cart: items,
          shippingAddress,
          user,
          totalPrice,
          paymentInfo,
        });
        orders.push(order);
      }

      sendOrderConfirmationEmail(user.email, {
        cart: orders.flatMap(order => order.cart),
        shippingAddress,
        user,
        totalPrice,
        paymentInfo,
      });

      res.status(201).json({
        success: true,
        orders,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// get all orders of user
router.get(
  "/get-all-orders/:userId",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const orders = await Order.find({ "user._id": req.params.userId }).sort({
        createdAt: -1,
      });

      res.status(200).json({
        success: true,
        orders,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// get all orders of seller
// router.get(
//   "/get-seller-all-orders/:shopId",
//   catchAsyncErrors(async (req, res, next) => {
//     try {
//       const orders = await Order.find({
//         "cart.shopId": req.params.shopId,
//       }).sort({
//         createdAt: -1,
//       });

//       res.status(200).json({
//         success: true,
//         orders,
//       });
//     } catch (error) {
//       return next(new ErrorHandler(error.message, 500));
//     }
//   })
// );

// lấy cả người xử lý đơn hàng lên
router.get(
  "/get-seller-all-orders/:shopId",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const orders = await Order.find({
        "cart.shopId": req.params.shopId,
      })
        .populate("handledBy") // Sử dụng populate để lấy chi tiết người xử lý đơn hàng
        .sort({
          createdAt: -1,
        });

      res.status(200).json({
        success: true,
        orders,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// update order status for seller
// router.put(
//   "/update-order-status/:id",
//   isSeller,
//   catchAsyncErrors(async (req, res, next) => {
//     try {
//       const order = await Order.findById(req.params.id);

//       if (!order) {
//         return next(new ErrorHandler("Đơn hàng không tìm thấy với ID này", 400));
//       }
//       if (req.body.status === "Transferred to delivery partner") {
//         order.cart.forEach(async (o) => {
//           await updateOrder(o._id, o.qty);
//         });
//       }

//       order.status = req.body.status;

//       if (req.body.status === "Delivered") {
//         order.deliveredAt = Date.now();
//         order.paymentInfo.status = "Succeeded";
//         const serviceCharge = order.totalPrice * 0.1;
//         await updateSellerInfo(order.totalPrice - serviceCharge);
//       }

//       await order.save({ validateBeforeSave: false });

//       res.status(200).json({
//         success: true,
//         order,
//       });

//       async function updateOrder(id, qty) {
//         const product = await Product.findById(id);

//         product.stock -= qty;
//         product.sold_out += qty;

//         await product.save({ validateBeforeSave: false });
//       }

//       async function updateSellerInfo(amount) {
//         const seller = await Shop.findById(req.seller.id);
        
//         seller.availableBalance = amount;

//         await seller.save();
//       }
//     } catch (error) {
//       return next(new ErrorHandler(error.message, 500));
//     }
//   })
// );

// update order status for seller
router.put(
  "/update-order-status/:id",
  isSeller,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const order = await Order.findById(req.params.id);

      if (!order) {
        return next(new ErrorHandler("Đơn hàng không tìm thấy với ID này", 400));
      }

      // Cập nhật người xử lý đơn hàng
      if (req.body.handlerId) {
        order.handledBy = req.body.handlerId;
      }

      console.log("Status received from client:", req.body.status); // Kiểm tra giá trị status

      if (req.body.status === "Transferred to delivery partner") {
        order.cart.forEach(async (o) => {
          await updateOrder(o._id, o.qty);
        });
      }

      // Cập nhật trạng thái đơn hàng
      order.status = req.body.status;

      // Kiểm tra nếu trạng thái là Delivered
      if (req.body.status === "Delivered") {
        order.deliveredAt = Date.now();
        order.paymentInfo.status = "Succeeded"; // Cập nhật trạng thái thanh toán
        const serviceCharge = order.totalPrice * 0.1;
        await updateSellerInfo(order.totalPrice - serviceCharge);
      }

      // Lưu thay đổi vào cơ sở dữ liệu
      await order.save({ validateBeforeSave: false });

      res.status(200).json({
        success: true,
        order,
      });

      // Hàm cập nhật sản phẩm
      async function updateOrder(id, qty) {
        const product = await Product.findById(id);

        product.stock -= qty;
        product.sold_out += qty;

        await product.save({ validateBeforeSave: false });
      }

      // Hàm cập nhật thông tin người bán
      async function updateSellerInfo(amount) {
        const seller = await Shop.findById(req.seller.id);
        seller.availableBalance += amount; // Cộng dồn số dư hiện tại của người bán

        await seller.save();
      }
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);


// give a refund ----- user
router.put(
  "/order-refund/:id",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const order = await Order.findById(req.params.id);

      if (!order) {
        return next(new ErrorHandler("Đơn hàng không tìm thấy với ID này", 400));
      }

      order.status = req.body.status;

      await order.save({ validateBeforeSave: false });

      res.status(200).json({
        success: true,
        order,
        message: "Yêu cầu hoàn tiền đặt hàng thành công!",
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// accept the refund ---- seller
router.put(
  "/order-refund-success/:id",
  isSeller,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const order = await Order.findById(req.params.id);

      if (!order) {
        return next(new ErrorHandler("Không tìm thấy đơn đặt hàng với id này", 400));
      }

      order.status = req.body.status;

      await order.save();

      res.status(200).json({
        success: true,
        message: "Hoàn tiền đặt hàng thành công!",
      });

      if (req.body.status === "Refund Success") {
        order.cart.forEach(async (o) => {
          await updateOrder(o._id, o.qty);
        });
      }

      async function updateOrder(id, qty) {
        const product = await Product.findById(id);

        product.stock += qty;
        product.sold_out -= qty;

        await product.save({ validateBeforeSave: false });
      }
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// all orders --- for admin
router.get(
  "/admin-all-orders",
  isAuthenticated,
  isAdmin("Admin"),
  catchAsyncErrors(async (req, res, next) => {
    try {
      const orders = await Order.find().sort({
        deliveredAt: -1,
        createdAt: -1,
      });
      res.status(201).json({
        success: true,
        orders,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

router.put(
  "/cancel-order/:id",
  // isAuthenticated,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const order = await Order.findById(req.params.id);

      if (!order) {
        return next(new ErrorHandler("Đơn hàng không tìm thấy với ID này", 400));
      }

      if (order.status === "Delivered" || order.status === "Refund Success") {
        return next(
          new ErrorHandler("Không thể hủy đơn hàng đã được giao hoặc đã hoàn tiền", 400)
        );
      }

      order.status = "Cancel";
      order.canceledAt = Date.now();

      await order.save({ validateBeforeSave: false });

      res.status(200).json({
        success: true,
        message: "Đơn hàng đã được hủy thành công!",
      });

      // Cập nhật lại số lượng sản phẩm trong kho nếu cần thiết
      order.cart.forEach(async (o) => {
        await updateProductStock(o._id, o.qty);
      });

      async function updateProductStock(id, qty) {
        const product = await Product.findById(id);

        product.stock += qty;
        product.sold_out -= qty;

        await product.save({ validateBeforeSave: false });
      }
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

module.exports = router;