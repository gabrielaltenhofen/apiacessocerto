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

// Defina a rota para recuperar dados de batidas de ponto por funcionário, mês e dia
// Defina a rota para recuperar todas as batidas de um mês específico
server.get('/batidas_de_ponto/:usuario/:ano/:mes', (req, res) => {
  const usuario = req.params.usuario;
  const ano = parseInt(req.params.ano);
  const mes = parseInt(req.params.mes);

  if (!usuario || !ano || !mes) {
    return res.status(400).json({ error: 'Parâmetros inválidos na URL' });
  }

  const db = admin.database();
  const ref = db.ref(`batidas_de_ponto/${usuario}/${ano}/${mes}`);

  ref.once('value', (snapshot) => {
    const data = snapshot.val();
    res.json(data);
  });
});
server.get('/registrar_ponto', (req, res) => {
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

    // A resposta deve ser um objeto, pois estamos buscando um único funcionário com base na tag.
    const funcionarioEncontrado = Object.values(usuarioData)[0];
    const statusUsuario = funcionarioEncontrado.status;

    if (statusUsuario !== 'Ativo') {
      return res.status(400).json({ error: 'Usuário inativo. Não é possível registrar ponto.' });
    }

    const dataHoraBrasilia = ajustarHoraParaBrasilia(new Date());
    const hora = dataHoraBrasilia.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const ano = dataHoraBrasilia.getFullYear();
    const mes = dataHoraBrasilia.getMonth() + 1; // Mês começa em 0
    const dia = dataHoraBrasilia.getDate().toString().padStart(2, '0'); // Dia com dois dígitos

    const ref = db.ref(`batidas_de_ponto/${tagUsuario}/${ano}/${mes}/${dia}`);

    // Verifique o número de batidas já registradas para o dia
    ref.once('value', (snapshot) => {
      const batidasDoDia = snapshot.numChildren();

      if (batidasDoDia >= 10) {
        return res.status(400).json({ error: 'Limite de batidas de ponto para o dia atingido (máximo 10).' });
      }

      // Determine o nome da variável para a nova batida
      const nomeVariavelNovaBatida = `batida${batidasDoDia + 1}`;
      const horaAtual = hora;

      const novaBatida = {
        data_hora: horaAtual,
      };

      // Use `child` para definir a nova batida
      ref.child(nomeVariavelNovaBatida).set(novaBatida, (error) => {
        if (error) {
          console.error('Erro ao registrar ponto:', error);
          res.status(500).json({ error: 'Erro interno do servidor' });
        } else {
          res.json({ message: 'Batida de ponto registrada com sucesso!' });
        }
      });
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

server.get('/api/ler-valor/:codigoAtivo', async (req, res) => {
  try {
    const { codigoAtivo } = req.params;
    const db = admin.database();
    const ref = db.ref('tabelaCodigos');

    // Faça a consulta no banco de dados Firebase
    const snapshot = await ref.child(codigoAtivo).once('value');
    const valor = snapshot.val();

    // Verifique se o código de ativo é válido
    if (valor !== null) {
      res.json({ codigoAtivo, valor });
    } else {
      res.status(404).json({ error: 'Código de ativo inválido.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao ler o valor.' });
  }
});



server.use(router);

server.listen(3000, () => {
  console.log("JSON Server is running");
});
