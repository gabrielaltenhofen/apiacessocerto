const jsonServer = require("json-server");
const server = jsonServer.create();
const router = jsonServer.router("db.json");
const admin = require('firebase-admin');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://ecacessocerto-default-rtdb.firebaseio.com',
});

const middlewares = jsonServer.defaults();

server.use(middlewares);

server.use(
  jsonServer.rewriter({
    "/*": "/$1",
  })
);

// Função para ajustar a hora para Brasília (GMT-3)
function ajustarHoraParaBrasilia(data) {
  const dataBrasilia = new Date(data);
  dataBrasilia.setHours(dataBrasilia.getHours() - 3); // Ajuste para GMT-3
  return dataBrasilia;
}

server.get('/acessoTag/:usuario/:ano/:mes', (req, res) => {
  const usuario = req.params.usuario;
  const ano = parseInt(req.params.ano);
  const mes = parseInt(req.params.mes);

  if (!usuario || !ano || !mes) {
    return res.status(400).json({ error: 'Parâmetros inválidos na URL' });
  }

  const db = admin.database();
  const ref = db.ref(`acessoTag/${usuario}/${ano}/${mes}`);

  ref.once('value', (snapshot) => {
    const data = snapshot.val();
    res.json(data);
  });
});

server.get('/entrada-tag', (req, res) => {
  const tagUsuario = req.query.usuario; // Tag do funcionário

  if (!tagUsuario) {
    return res.status(400).json({ error: 'Parâmetro "usuario" (tag) é obrigatório na URL' });
  }

  const db = admin.database();
  const refUsuario = db.ref('usuarios').orderByChild('tag').equalTo(tagUsuario); // Referência ao usuário

  // Verifique o status do usuário
  refUsuario.once('value', (snapshotUsuario) => {
    const usuarioData = snapshotUsuario.val();

    if (!usuarioData) {
      return res.status(400).json({ error: 'Usuário não encontrado.' });
    }

    const funcionarioEncontrado = Object.values(usuarioData)[0];
    const statusUsuario = funcionarioEncontrado.status;

    if (statusUsuario !== 'Ativo') {
      return res.status(400).json({ error: 'Usuário inativo. Não é possível liberar acesso!' });
    }

    const dataHoraBrasilia = ajustarHoraParaBrasilia(new Date());
    const dataHoraString = dataHoraBrasilia.toLocaleString('pt-BR');

    const ref = db.ref(`acessoTag/${tagUsuario}`);

    // Adicione a data e hora como uma string
    ref.push(dataHoraString, (error) => {
      if (error) {
        console.error('Erro ao registrar ponto:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      } else {
        res.json({ message: 'Batida de ponto registrada com sucesso!' });
      }
    });
  });
});


// Defina a rota para listar todos os funcionários com suas tags e nomes
server.get('/usuarios', (req, res) => {
  const db = admin.database();
  const ref = db.ref('usuarios'); // Use o nome correto da tabela, que é 'funcionario'.

  ref.once('value', (snapshot) => {
    const funcionarios = snapshot.val();
    if (!funcionarios) {
      return res.status(404).json({ error: 'Nenhum funcionário encontrado.' });
    }

    const funcionariosList = Object.values(funcionarios).map(funcionario => ({
      tag: funcionario.tag, // Use a tag do funcionário
      name: funcionario.name
    }));

    res.json(funcionariosList);
  });
});


// Defina a rota para buscar um funcionário pela tag
server.get('/usuarios/tag/:tag', (req, res) => {
  const tag = req.params.tag;

  if (!tag) {
    return res.status(400).json({ error: 'Parâmetro "tag" é obrigatório na URL' });
  }

  const db = admin.database();
  const ref = db.ref('usuarios');

  ref.orderByChild('tag').equalTo(tag).once('value', (snapshot) => {
    const funcionarios = snapshot.val();

    if (!funcionarios) {
      return res.status(404).json({ error: 'Funcionário não encontrado.' });
    }

    // Assumindo que apenas um funcionário tem a tag fornecida,
    // você pode pegar o primeiro funcionário encontrado.
    const funcionario = Object.values(funcionarios)[0];

    res.json(funcionario);
  });
});

let codigoGeradoNoSite; // Variável global para armazenar o código gerado no site

// Rota para receber o código do ESP32 e compará-lo com o código gerado no site (usando GET)
server.get('/verificar-codigo/:codigo', (req, res) => {
    const codigoRecebido = req.params.codigo;

    if (codigoRecebido === codigoGeradoNoSite) {
        // Acesso liberado, registre a hora e data no Firebase
        const dataHoraAtual = new Date();
        const dataFormatada = `${dataHoraAtual.getDate()}/${dataHoraAtual.getMonth() + 1}/${dataHoraAtual.getFullYear()}`;
        const horaFormatada = `${dataHoraAtual.getHours()}:${dataHoraAtual.getMinutes()}`;
        const dataHoraFormatada = `${horaFormatada} - ${dataFormatada}`;

        const db = admin.database();
        const ref = db.ref('acessoCodigo'); // Referência para a tabela acessoCodigo

        // Crie um novo nó com a hora e data formatada no Firebase
        const newAccessRef = ref.push();
        newAccessRef.set({
            timestamp: dataHoraFormatada
        });

        res.json({ resultado: 'Acesso liberado' });
    } else {
        res.status(400).json({ resultado: 'Acesso negado' });
    }
});

// Rota para atualizar o código gerado no site (usando GET)
server.get('/atualizar-codigo/:codigo', (req, res) => {
    codigoGeradoNoSite = req.params.codigo;
    res.json({ resultado: 'Código atualizado' });
});


server.use(router);

server.listen(3000, () => {
  console.log("JSON Server is running");
});
