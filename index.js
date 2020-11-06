let express = require('express');
let app = express ();
let http = require('http').createServer(app,
    {cookie: false});
let io = require('socket.io')(http);
let cookieParser = require('cookie-parser');

const state = {
  currentUsers : [],
  userHistory : [], //contain all users who ever joined
  chatMessages : [],
  nameCmd: "name",
  colorCmd: "color",
  smileCode: "&#128513;",
  sadCode: "&#128577;",
  surprisedCode: "&#128562;",
  errorMsg: "",
};

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.use(cookieParser());
//serve static files, like css!
app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log("cookie:", socket.request.headers.cookie);
    const cookie = socket.request.headers.cookie;
    if (cookie === undefined) {
        state.currentUsers.push(getUniqueUsername(socket.id));
        console.log("cookie undefined when first connect", state.userHistory);
    }
    else {
        const cookies = cookie.trim().split(";");
        for (let i = 0; i < cookies.length; i++) {
            cookies[i] = cookies[i].trim();
        }
        console.log(cookies);
        let historyLength = state.userHistory.length;
        let match = cookies.filter((cookie) => {
            if (historyLength <= 0) {
                return false;
            }
            return cookie.split('=')[0] === state.userHistory[historyLength-1].id;
        });
        if (match.length > 0) {
            //check if username has been taken
            const cookieUsername = match[match.length-1].split("=")[1];
            console.log("cookie username:", cookieUsername);
            const currentuserhascookieUsername = state.currentUsers.some((elem) => {
                return elem.username === cookieUsername;
            });
            if (currentuserhascookieUsername) {
                console.log("get unique username");
                state.currentUsers.push(getUniqueUsername(socket.id));
            }
            else {
                console.log("use cookie username");
                state.currentUsers.push({
                    id: socket.id,
                    username: cookieUsername
                });
            }
        }
        else {
            state.currentUsers.push(getUniqueUsername(socket.id));
        }
    }
    
    console.log("user connected", state, socket.id, socket.request.headers.cookie);
    io.emit('state update', state);
    socket.on('chat message', (msg) => {
        console.log(socket.id);
        if (msg[0] === '/') { //if it's a command
            let arr = msg.split(' ');
            console.log(arr);
            let command = arr[0].slice(1);
            if (command.toLowerCase() === state.nameCmd) {
                console.log("name cmd");
                if (arr.length <= 1) {
                    const errMsg = `no username given!`;
                    console.error(errMsg);
                    state.errorMsg = errMsg;
                    io.to(socket.id).emit('state update', state);
                    return;
                }
                else {
                    const newUsername = arr[1];
                    //check if username is already being used
                    if (state.currentUsers.some(elem => elem.username === newUsername)) {
                        const errMsg = `username already in use!`;
                        console.error(errMsg);
                        state.errorMsg = errMsg;
                        io.to(socket.id).emit('state update', state);
                        return;
                    }
                    else {
                        state.currentUsers = state.currentUsers.map((userObj) => {
                            if (userObj.id === socket.id) {
                                return { ...userObj, username: newUsername};
                            }
                            return userObj;
                        });
                        state.chatMessages = state.chatMessages.map((package) => {
                            if (package.id === socket.id) {
                                return {...package, username: newUsername};
                            }
                            return package;
                        });
                    }
                }
            }
            else if (command.toLowerCase() === state.colorCmd) {
                console.log("color cmd");
                if (arr.length <= 1) {
                    const errMsg = `no color given!`;
                    console.error(errMsg);
                    state.errorMsg = errMsg;
                    io.to(socket.id).emit('state update', state);
                    return;
                }
                else {
                    const newColor = arr[1];
                    let re = /^[0-9A-Fa-f]{3,6}$/g;
                    if (re.test(newColor) && (newColor.length === 3 || newColor.length === 6)) {
                        state.currentUsers = state.currentUsers.map((userObj) => {
                            if (userObj.id === socket.id) {
                                return { ...userObj, color: newColor};
                            }
                            return userObj;
                        });
                    }
                    else {
                        const errMsg = `invalid color given!`;
                        console.error(errMsg);
                        state.errorMsg = errMsg;
                        io.to(socket.id).emit('state update', state);
                        return;
                    }
                }
            }
            else {
                const errMsg = `unknown command: ${command}`;
                console.error(errMsg);
                state.errorMsg = errMsg;
                io.to(socket.id).emit('state update', state);
                return;
            }
        }
        else {
            const userObj = state.currentUsers.find(element => element.id === socket.id);
            let date = new Date();
            const timeStamp = `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
            //change ":)" to emoticon
            let filter = /:\)/gi;
            let updatedMsg = msg.replace(filter, state.smileCode);
            //change ":(" to emoticon
            filter = /:\(/gi;
            updatedMsg = updatedMsg.replace(filter, state.sadCode);
            //change ":o" or ":O" to emoticon
            filter = /:[o|O]/gi;
            updatedMsg = updatedMsg.replace(filter, state.surprisedCode);
            const package = {
                id: userObj.id,
                username: userObj.username,
                msg: updatedMsg,
                timeStamp: timeStamp
            };
            state.chatMessages.push(package);
        }
        console.log('new state: ' + state);

        io.emit('state update', state);
    });
    socket.on('disconnect', () => {
        console.log("disconnecting:", socket.request.headers.cookie);
        //store user in past users incase of reconnection
        //first check if already exists in pastHistory, if so overwrite
        const inPastUsers = state.userHistory.find(element => element.id === socket.id);
        const currentUserObj = state.currentUsers.find(element => element.id === socket.id);
        if (inPastUsers !== undefined) { //then must overwrite
            state.userHistory = state.userHistory.map((element) => {
                if (element.id === socket.id) {
                    return {
                        id:element.id,
                        username:currentUserObj.username
                    };
                }
                return element;
            })
        }
        else {
            state.userHistory.push({id:currentUserObj.id,username:currentUserObj.username});
        }
        state.currentUsers = state.currentUsers.filter((userObj) => {
          return userObj.id !== socket.id;
        });
        io.emit('state update', state);
        console.log("user disconnected", state.currentUsers, state.userHistory, socket.id);
    });

    socket.on('clear error', () => {
        state.errorMsg = "";
        console.log("clearing error:", state.errorMsg);
    });

});

http.listen(3000, () => {
  console.log('listening on *:3000');
});

function getUniqueUsername(id) {
    const prefix = "user_";
    const userCount = state.currentUsers.length;
    if (userCount === 0) {
        return {
            id: id,
            username: prefix + "1"
        };
    }
    let lastNumber = state.currentUsers[userCount-1].username.split("_")[1];
    let nextNumber = Number(lastNumber) + 1;
    let nextUser = prefix + String(nextNumber);

    //check that this user is unique
    while (true) {
        const match = state.currentUsers.filter((userObj) => {
            return userObj.username === nextUser;
        })
        if (match.length > 0) {
            console.error("username not unique! ", nextUser, " already exists");
            nextNumber++;
            nextUser = prefix + String(nextNumber);
        }
        else {
            break;
        }
    }
    return {
        id: id,
        username: nextUser
    };
};