var express = require('express');
var app = express();
var http = require('http');
var server = http.Server(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 8080;



var fs = require('fs');
var util = require('util');
var log_file = fs.createWriteStream(__dirname + '/debug.log', {flags : 'w'});
var log_stdout = process.stdout;

console.log = function(d) { //
  log_file.write(util.format(d) + '\n');
  log_stdout.write(util.format(d) + '\n');
};



server.listen(port, function () {
	console.log('Updated : Server listening at port '+port);
	console.log("**Socket.IO Version: " + require('socket.io/package').version);
});

// routing
app.get('/',function(req,res){
	//request : son cabeceras y datos que nos envia el navegador.
	//response : son todo lo que enviamos desde el servidor.
	res.sendFile(__dirname + '/index.html');
});


io.sockets.on('connection', function (socket) {
	socket.room = 'Global';
	socket.join(socket.room);
	console.log('- Total Online: '+io.engine.clientsCount);
	io.sockets.emit('TotalOnline', io.engine.clientsCount);
	io.sockets.emit('RoomOnline', GetUsersInRoom(socket.room).length);
	socket.UserName = '';
	
	
	//Adiciona novo Usuario, Faz verificar a Session atual do php, com a do Registrado em mysql
	socket.on('NewUser', function(UserSession){
		io.sockets.emit('TotalOnline', io.engine.clientsCount);
		io.sockets.emit('RoomOnline', GetUsersInRoom(socket.room).length);
		socket.UserName = '';
		if(UserSession != ''){
			GetUserInfos(UserSession);
		}
	});
	
	// recebe mensagem do usuario (Para enviar para sala atual)
	socket.on('SendRoomMensagem', function (Mensagem) {
		if(socket.UserName == '') return false;
		var firstWord = Mensagem.substr(0, Mensagem.indexOf(" "));
		var finalMessage;
		if(Mensagem == '/totalonline'){
			socket.emit('UpdateServerMensagem', 'user online:' + io.engine.clientsCount); // Retorna mensagem para o cliente atual
		}else 
		if(Mensagem == '/usersonline'){
			var Users = GetUsersInRoom(socket.room);
			socket.emit('UpdateServerMensagem', 'user online:' + Users.join(', ')); // Retorna mensagem para o cliente atual
		}else
		if(firstWord == '/kickuser'){
			finalMessage = Mensagem.substr(Mensagem.indexOf(" ") + 1);
			var uSocketID = UserIsOnline(finalMessage);
			if(uSocketID != false){
				io.to(uSocketID).disconnect();
			}else{
				socket.emit('UpdateServerMensagem', 'User "'+finalMessage+'" Offline! , Detalhe:'+uSocketID);
			}
		}else{
			var SendReturn = {};
			SendReturn['From'] = socket.UserName;
			SendReturn['Message'] = Mensagem;
			SendReturn['ImgURL'] = socket.ImgURL;
			SendReturn['Rank'] = socket.rank;
			SendReturn['Class'] = socket.Class;
			
			SendReturn['COMMENT_ID'] = randomString(10);
			SendReturn['TIMESTAMP'] = Date.now() / 1000 | 0;
			SendReturn['AUTHOR_ID'] = socket.id;
			io.sockets.in(socket.room).emit('UpdateRoomMensagem', SendReturn); // manda para a sala atual
		}
	});
	
	
	// mensagem será visualizada em todas as salas
	socket.on('SendGlobalMensagem', function (Mensagem) {
		if(socket.UserName == '') return false;
		io.sockets.emit('UpdateGlobalMensagem', "['Global']", Mensagem);
	});
	// Manda mensagem privada
	socket.on('SendPrivateMensagem', function (To, Mensagem) {
		if(socket.UserName == '') return false;
		var uSocketID = UserIsOnline(To);
		if(uSocketID != false){
			io.to(uSocketID).emit('UpdatePrivateMensagem', socket.UserName, Mensagem);
		}else{
			socket.emit('UpdateServerMensagem', 'User Offline');
		}
	});
	socket.on('KickUser', function (KickUser) {
		if(socket.UserName == '') return false;
		var uSocketID = UserIsOnline(KickUser);
		if(uSocketID != false){
			io.to(uSocketID).disconnect();
		}else{
			socket.emit('UpdateServerMensagem', 'User Offline');
		}
	});
	
	
	socket.on('SwitchRoom', function(NewRoom){
		if(socket.UserName == '') return false;
		socket.leave(socket.room);
		socket.join(NewRoom);
		socket.emit('UpdateServerMensagem', 'Você entrou na sala '+ NewRoom); // Manda mensagem para o cliente
		socket.broadcast.to(socket.room).emit('UpdateServerMensagem', socket.UserName+' Saiu da Sala');// Manda mensagem para antiga sala
		socket.room = NewRoom;
		socket.broadcast.to(NewRoom).emit('UpdateServerMensagem', socket.UserName+' Entrou na Sala'); // Manda mensagem para a nova sala
		
		io.sockets.emit('TotalOnline', io.engine.clientsCount);
	});
	
	
	socket.on('disconnect', function(){
		if(socket.UserName){
			io.sockets.emit('UserList', socket.UserName); // atualiza a lista de Usuarios no cliente
		}
		io.sockets.emit('TotalOnline', io.engine.clientsCount);
		io.sockets.emit('RoomOnline', GetUsersInRoom(socket.room).length);
		
		if(socket.UserName){
			socket.broadcast.emit('UpdateServerMensagem', socket.UserName + ' Desconectou!'); // manda uma mensagem(para todos) falando que foi disconectado
		}
		if(socket.room){
			socket.leave(socket.room);
		}
		if(socket.UserName){
			console.log('[Console Log] '+socket.UserName+' Desconectou!');
		}else{
			console.log('[Console Log] Visitante Desconectou!');
		}
	});
	
	
	
	
	// Verifica se o usuario está online, retorna o socket id caso esteja, caso não retorna false.
	function UserIsOnline(UserName){
		var UserID = false;
		if(UserName != ''){
			Object.keys(io.sockets.sockets).some(function(SiD) {
				if(io.sockets.connected[SiD].UserName == UserName){
					UserID = SiD;
					return true;
				}
			});
		}
		return UserID;
	}
	
	// Obter usuarios na sala escolhida 
	function GetUsersInRoom(RoomName){
		var Users = [];
		var room = io.sockets.adapter.rooms[RoomName];
		if(room){
			console.log('Usuarios Na Sala ('+RoomName+') :'+room.length);
			
			for (var SiD in room.sockets) {
				if(io.sockets.connected[SiD]){
					if(io.sockets.connected[SiD].UserName != ''){
						Users.push(io.sockets.connected[SiD].UserName);
					}
				}
			}
		}
		return Users;
	}
	function GetUserInfos(SessionID){
		var ChatGlobalSlug = 'global'
		var options = {
			host: 'localhost',
			port: 80,
			path: '/api/user/?id='+SessionID
		};

		http.get(options, function(res) {
			var data = "";
			res.on('data', function (chunk) {
				data += chunk;
			});
			res.on("end", function() {
				if(data != ''){
					var UserInfo = JSON.parse(data);
					if(UserInfo){
						SetUserInfos(UserInfo);
					}else{
						SetUserInfos(false);
					}
				}else{
					SetUserInfos(false);
				}
			});
		}).on('error', function(e) {
			SetUserInfos(false);
		});
	}
	function SetUserInfos(UserInfos){
		if(UserInfos != false){
			//Desconeta o mesmo Usuario online em outro Chat(Outras Abas, navegadores, do mesmo usuario)
			var IsOnline = UserIsOnline(UserInfos['Username']);
			if(IsOnline != false){
				io.sockets.connected[IsOnline].emit('UpdateServerMensagem', 'Você Acabou de conectar-se em outra instancia!');
				io.sockets.connected[IsOnline].disconnect();
			}
			if(UserInfos['Room']['UserIsBanned'] == true){
				var BanIndo = {};
				BanIndo['BanndByUser'] = UserInfos['Room']['Name'];
				BanIndo['BanTimeStart'] = UserInfos['Room']['BanTimeStart'];
				BanIndo['BanTimeEnd'] = UserInfos['Room']['BanTimeEnd'];
				socket.emit('UpdateServerMensagem', 'Você Está Banido Do Chat Global');
				socket.emit('UpdateBanMensagem', BanIndo);
				socket.disconnect();
				return;
			}
			
			// Define padroes do usuario
			socket.UserName = UserInfos['Username'];
			socket.ImgURL = UserInfos['ImageURL'];
			socket.rank = UserInfos['Room']['UserIs'];
			socket.Class = UserInfos['Room']['UserClass'];
			socket.room = 'Global';
			socket.join(socket.room);
			
			var ClientInfo = {};
			ClientInfo['RoomName'] = UserInfos['Room']['Name'];
			ClientInfo['RoomDescription'] = UserInfos['Room']['Description'];
			ClientInfo['Rank'] = UserInfos['Room']['UserIs'];
			ClientInfo['Class'] = UserInfos['Room']['UserClass'];
			
			
			socket.emit('UpdateServerMensagem', 'você acabou de entrar no chat Global!'); // Retorna mensagem para o cliente atual
			socket.emit('IsOnline', ClientInfo);
			
			console.log('[Console Log] '+socket.UserName+' Conectou!');
			io.sockets.emit('TotalOnline', io.engine.clientsCount);
			io.sockets.emit('RoomOnline', GetUsersInRoom(socket.room).length);
			
		}
	}
	
	/*
	var interval = setInterval(function(){ChatCheckText()},1000);
	function ChatCheckText() {
		console.log('Total online: '+io.engine.clientsCount);
	}
	*/
	
	function randomString(length) {
		var text = "";
		var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for(var i = 0; i < length; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
	
});