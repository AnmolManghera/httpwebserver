import * as net from "net";
function socketInit(socket){
    const connection = {
        socket:socket,
        err:null,
        ended:false,
        reader:null
    }
    socket.on('data',(data)=>{
        connection.socket.pause();
        connection.reader.resolve(data);
        connection.reader = null;
    })
    socket.on('end',()=>{
        connection.ended = true;
        if(connection.reader){
            connection.reader.resolve(Buffer.from(''));
            connection.reader = null;
        }
    })
    socket.on('error',(err)=>{
        connection.err = err;
        if(connection.reader){
            connection.reader.reject(err)
            connection.reader = null
        }
    })
    return connection;
}
function socketRead(connection){
    //The socketRead function returns a promise which is resolved with socket data.
    return new Promise((resolve,reject)=>{
        if(connection.err){
            reject(connection.err)
            return;
        }
        if(connection.ended){
            resolve(Buffer.from(''))
            return
        }
        connection.reader = {resolve:resolve,reject:reject};
        connection.socket.resume();
    })
}

function socketWrite(connection,data){
    return new Promise((resolve,reject)=>{
        if(connection.err){
            reject(connection.err);
            return;
        }
        connection.socket.write(data,(err)=>{
            if(err){
                reject(err);
            } else {
                resolve();
            }
        })
    })
}

async function newConnection(socket){
    console.log('new connection',socket.remoteAddress,socket.remotePort);
    try {
        await serveClient(socket)
    } catch (err) {
        console.log(err)
    } finally {
        socket.destroy();
    }
}

function bufPush(buf,data){
    const newLen = buf.length + data.length;
    if(buf.data.length < newLen){
        let cap = Math.max(buf.data.length,32);
        while(cap < newLen){
            cap *= 2;
        }
        const grown = Buffer.alloc(cap)
        buf.data.copy(grown , 0,0);
        buf.data = grown;
    }
    data.copy(buf.data,buf.length,0)
    buf.length = newLen
}

async function serveClient(socket){
    const connection = socketInit(socket)
    const buf  = {data:Buffer.alloc(0),length:0}
    
    while(true){
        const msg = cutMessage(buf);
        if(!msg){
            const data = await socketRead(connection);
            bufPush(buf,data);
            if(data.length === 0){
                console.log('end connection')
                break;
            }
            continue;
        }
        if(msg.equals(Buffer.from('quit\n'))){
            await socketWrite(connection,Buffer.from('Bye.\n'))
            socket.destroy()
            return;
        } else {
            const reply = Buffer.concat([Buffer.from('Echo: '),msg])
            await socketWrite(connection,reply)
        }
    }
}

function cutMessage(buf){
    const idx = buf.data.subarray(0,buf.length).indexOf('\n')
    if(idx < 0){
        return null
    }
    const msg = Buffer.from(buf.data.subarray(0,idx+1));
    bufPop(buf,idx+1)
    return msg;
}

function bufPop(buf,len){
    buf.data.copyWithin(0,len,buf.length)
    buf.length -= len
}


const server = net.createServer({
    pauseOnConnect: true, // required by `TCPConn`
});
server.on('error', (err) => { throw err; });
server.on('connection', newConnection);
server.listen({ host: '127.0.0.1', port: 1238 });