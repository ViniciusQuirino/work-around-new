const { Client, Location, List, Buttons, LocalAuth } = require("./index");
const express = require("express");
const { body, validationResult } = require("express-validator");
const socketIO = require("socket.io");
const qrcode = require("qrcode");
const http = require("http");
const fs = require("fs");
const { phoneNumberFormatter } = require("./helpers/formatter");
const fileUpload = require("express-fileupload");
const axios = require("axios");

const client = new Client({
    authStrategy: new LocalAuth(),
    // proxyAuthentication: { username: 'username', password: 'password' },
    puppeteer: {
        // args: ['--proxy-server=proxy-server-that-requires-authentication.example.com'],
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--single-process", // <- this one doesn't works in Windows
            "--disable-gpu",
          ],
    },
});


const port = process.env.PORT || 7005;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(
    express.urlencoded({
        extended: true,
    })
);

app.use(
    fileUpload({
        debug: true,
    })
);

app.get("/", (req, res) => {
    res.sendFile("index.html", {
        root: __dirname,
    });
});

client.on("message", async (msg) => {
    console.log("MESSAGE RECEIVED", msg);
});


const job = new CronJob("*/5 * * * *", async () => {
    try {
      const response = await axios.get("https://php-rbj2.onrender.com/products");
  
      console.log("DEU CERTO");
      // console.log(response.data);
    } catch (error) {
      console.error("Ocorreu um erro na requisição:", error.message);
    }
  });
  
  const jobWhats = new CronJob("*/5 * * * *", async () => {
    try {
      const response = await axios.post(
        "https://work-around-igk7.onrender.com/send-message",
        { message: "Hello", number: "5514998536591@c.us" }
      );
  
      console.log("DEU CERTO WPP");
    
    } catch (error) {
      console.error("Ocorreu um erro na requisição:", error.message);
    }
  });
  
  job.start();
  jobWhats.start();

client.initialize();

// Socket IO
io.on("connection", function (socket) {
    socket.emit("message", "Connecting...");

    client.on("qr", (qr) => {
        console.log("QR RECEIVED", qr);
        qrcode.toDataURL(qr, (err, url) => {
            socket.emit("qr", url);
            socket.emit("message", "QR Code received, scan please!");
        });
    });

    client.on("ready", () => {
        socket.emit("ready", "Whatsapp is ready!");
        socket.emit("message", "Whatsapp is ready!");
    });

    client.on("authenticated", () => {
        socket.emit("authenticated", "Whatsapp is authenticated!");
        socket.emit("message", "Whatsapp is authenticated!");
        console.log("AUTHENTICATED");
    });

    client.on("auth_failure", function (session) {
        socket.emit("message", "Auth failure, restarting...");
    });

    client.on("disconnected", (reason) => {
        socket.emit("message", "Whatsapp is disconnected!");
        client.destroy();
        client.initialize();
    });
});

const checkRegisteredNumber = async function (number) {
    const isRegistered = await client.isRegisteredUser(number);
    return isRegistered;
};

// Send message
app.post(
    "/send-message",
    [body("number").notEmpty(), body("message").notEmpty()],
    async (req, res) => {
        const errors = validationResult(req).formatWith(({ msg }) => {
            return msg;
        });

        if (!errors.isEmpty()) {
            return res.status(422).json({
                status: false,
                message: errors.mapped(),
            });
        }

        const number = phoneNumberFormatter(req.body.number);
        const message = req.body.message;

        const isRegisteredNumber = await checkRegisteredNumber(number);

        if (!isRegisteredNumber) {
            return res.status(422).json({
                status: false,
                message: "The number is not registered",
            });
        }

        client
            .sendMessage(number, message)
            .then((response) => {
                res.status(200).json({
                    status: true,
                    response: response,
                });
            })
            .catch((err) => {
                res.status(500).json({
                    status: false,
                    response: err,
                });
            });
    }
);

// Send media
app.post("/send-media", async (req, res) => {
    const number = phoneNumberFormatter(req.body.number);
    const caption = req.body.caption;
    const fileUrl = req.body.file;

    // const media = MessageMedia.fromFilePath('./image-example.png');
    // const file = req.files.file;
    // const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
    let mimetype;
    const attachment = await axios
        .get(fileUrl, {
            responseType: "arraybuffer",
        })
        .then((response) => {
            mimetype = response.headers["content-type"];
            return response.data.toString("base64");
        });

    const media = new MessageMedia(mimetype, attachment, "Media");

    client
        .sendMessage(number, media, {
            caption: caption,
        })
        .then((response) => {
            res.status(200).json({
                status: true,
                response: response,
            });
        })
        .catch((err) => {
            res.status(500).json({
                status: false,
                response: err,
            });
        });
});

server.listen(port, function () {
    console.log("App running on *: " + port);
});

client.on("loading_screen", (percent, message) => {
    console.log("LOADING SCREEN", percent, message);
});

client.on("qr", (qr) => {
    // NOTE: This event will not be fired if a session is specified.
    console.log("QR RECEIVED", qr);
});

client.on("authenticated", () => {
    console.log("AUTHENTICATED");
});

client.on("auth_failure", (msg) => {
    // Fired if session restore was unsuccessful
    console.error("AUTHENTICATION FAILURE", msg);
});

client.on("ready", () => {
    console.log("READY");
});


client.on("message_create", (msg) => {
    // Fired on all message creations, including your own
    if (msg.fromMe) {
        // do stuff here
    }
});

client.on("message_revoke_everyone", async (after, before) => {
    // Fired whenever a message is deleted by anyone (including you)
    console.log(after); // message after it was deleted.
    if (before) {
        console.log(before); // message before it was deleted.
    }
});

client.on("message_revoke_me", async (msg) => {
    // Fired whenever a message is only deleted in your own view.
    console.log(msg.body); // message before it was deleted.
});

client.on("message_ack", (msg, ack) => {
    /*
        == ACK VALUES ==
        ACK_ERROR: -1
        ACK_PENDING: 0
        ACK_SERVER: 1
        ACK_DEVICE: 2
        ACK_READ: 3
        ACK_PLAYED: 4
    */

    if (ack == 3) {
        // The message was read
    }
});

client.on("group_join", (notification) => {
    // User has joined or been added to the group.
    console.log("join", notification);
    notification.reply("User joined.");
});

client.on("group_leave", (notification) => {
    // User has left or been kicked from the group.
    console.log("leave", notification);
    notification.reply("User left.");
});

client.on("group_update", (notification) => {
    // Group picture, subject or description has been updated.
    console.log("update", notification);
});

client.on("change_state", (state) => {
    console.log("CHANGE STATE", state);
});

// Change to false if you don't want to reject incoming calls
let rejectCalls = true;

client.on("call", async (call) => {
    console.log("Call received, rejecting. GOTO Line 261 to disable", call);
    if (rejectCalls) await call.reject();
    await client.sendMessage(
        call.from,
        `[${call.fromMe ? "Outgoing" : "Incoming"}] Phone call from ${
            call.from
        }, type ${call.isGroup ? "group" : ""} ${
            call.isVideo ? "video" : "audio"
        } call. ${
            rejectCalls
                ? "This call was automatically rejected by the script."
                : ""
        }`
    );
});

client.on("disconnected", (reason) => {
    console.log("Client was logged out", reason);
});

client.on("contact_changed", async (message, oldId, newId, isContact) => {
    /** The time the event occurred. */
    const eventTime = new Date(message.timestamp * 1000).toLocaleString();

    console.log(
        `The contact ${oldId.slice(0, -5)}` +
            `${
                !isContact
                    ? " that participates in group " +
                      `${
                          (await client.getChatById(message.to ?? message.from))
                              .name
                      } `
                    : " "
            }` +
            `changed their phone number\nat ${eventTime}.\n` +
            `Their new phone number is ${newId.slice(0, -5)}.\n`
    );

    /**
     * Information about the @param {message}:
     *
     * 1. If a notification was emitted due to a group participant changing their phone number:
     * @param {message.author} is a participant's id before the change.
     * @param {message.recipients[0]} is a participant's id after the change (a new one).
     *
     * 1.1 If the contact who changed their number WAS in the current user's contact list at the time of the change:
     * @param {message.to} is a group chat id the event was emitted in.
     * @param {message.from} is a current user's id that got an notification message in the group.
     * Also the @param {message.fromMe} is TRUE.
     *
     * 1.2 Otherwise:
     * @param {message.from} is a group chat id the event was emitted in.
     * @param {message.to} is @type {undefined}.
     * Also @param {message.fromMe} is FALSE.
     *
     * 2. If a notification was emitted due to a contact changing their phone number:
     * @param {message.templateParams} is an array of two user's ids:
     * the old (before the change) and a new one, stored in alphabetical order.
     * @param {message.from} is a current user's id that has a chat with a user,
     * whos phone number was changed.
     * @param {message.to} is a user's id (after the change), the current user has a chat with.
     */
});

client.on("group_admin_changed", (notification) => {
    if (notification.type === "promote") {
        /**
         * Emitted when a current user is promoted to an admin.
         * {@link notification.author} is a user who performs the action of promoting/demoting the current user.
         */
        console.log(`You were promoted by ${notification.author}`);
    } else if (notification.type === "demote")
        /** Emitted when a current user is demoted to a regular user. */
        console.log(`You were demoted by ${notification.author}`);
});
