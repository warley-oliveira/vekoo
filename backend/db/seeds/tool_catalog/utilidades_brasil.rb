# Seed do catálogo de Tools — uma "Tool" agrupa templates de function_actions que
# a organização instala. Ao instalar, cada
# template vira um ToolFunction::MiniRacer real.
#
# Esta seed cria a Tool "Utilidades Brasil" com funções comuns sem credenciais.

puts '[seed:tools] Utilidades Brasil...'

VALIDATE_CPF_CNPJ_JS = <<~JS
  function onlyDigits(s) { return String(s || '').replace(/\\D/g, ''); }

  function validateCpf(cpf) {
    if (cpf.length !== 11 || /^(\\d)\\1+$/.test(cpf)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
    let d1 = (sum * 10) % 11;
    if (d1 === 10) d1 = 0;
    if (d1 !== parseInt(cpf[9], 10)) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
    let d2 = (sum * 10) % 11;
    if (d2 === 10) d2 = 0;
    return d2 === parseInt(cpf[10], 10);
  }

  function validateCnpj(cnpj) {
    if (cnpj.length !== 14 || /^(\\d)\\1+$/.test(cnpj)) return false;
    const calc = (slice, weights) => {
      let sum = 0;
      for (let i = 0; i < weights.length; i++) sum += parseInt(slice[i], 10) * weights[i];
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const w1 = [5,4,3,2,9,8,7,6,5,4,3,2];
    const w2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const d1 = calc(cnpj.slice(0, 12), w1);
    if (d1 !== parseInt(cnpj[12], 10)) return false;
    const d2 = calc(cnpj.slice(0, 13), w2);
    return d2 === parseInt(cnpj[13], 10);
  }

  const digits = onlyDigits(params.document);
  let kind = null;
  let valid = false;
  if (digits.length === 11)      { kind = 'cpf';  valid = validateCpf(digits); }
  else if (digits.length === 14) { kind = 'cnpj'; valid = validateCnpj(digits); }
  else                           { kind = 'unknown'; valid = false; }

  return { valid: valid, kind: kind, normalized: digits };
JS

LOOKUP_CEP_JS = <<~JS
  const cep = String(params.cep || '').replace(/\\D/g, '');
  if (cep.length !== 8) {
    return { error: 'CEP inválido: precisa ter 8 dígitos', cep: params.cep };
  }
  const res = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
  if (!res.ok) {
    return { error: 'Falha na consulta ViaCEP', status: res.status };
  }
  const data = await res.json();
  if (data.erro) return { error: 'CEP não encontrado', cep: cep };
  return {
    cep: data.cep,
    logradouro: data.logradouro,
    complemento: data.complemento,
    bairro: data.bairro,
    cidade: data.localidade,
    uf: data.uf,
    ibge: data.ibge
  };
JS

CALCULATE_AGE_JS = <<~JS
  const raw = String(params.birth_date || '').trim();
  if (!raw) return { error: 'birth_date obrigatório' };
  const birth = new Date(raw);
  if (isNaN(birth.getTime())) return { error: 'birth_date inválida; use YYYY-MM-DD' };
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return { age: age, birth_date: raw };
JS

FORMAT_PHONE_BR_JS = <<~JS
  const digits = String(params.phone || '').replace(/\\D/g, '');
  if (digits.length < 10 || digits.length > 13) {
    return { error: 'telefone inválido', original: params.phone };
  }
  let national = digits;
  if (national.startsWith('55') && (national.length === 12 || national.length === 13)) {
    national = national.slice(2);
  }
  if (national.length !== 10 && national.length !== 11) {
    return { error: 'telefone inválido após normalização', original: params.phone };
  }
  const ddd = national.slice(0, 2);
  const rest = national.slice(2);
  const formatted = rest.length === 9
    ? '(' + ddd + ') ' + rest.slice(0, 5) + '-' + rest.slice(5)
    : '(' + ddd + ') ' + rest.slice(0, 4) + '-' + rest.slice(4);
  return {
    e164: '+55' + national,
    national: national,
    formatted: formatted,
    ddd: ddd
  };
JS

BASE64_JS = <<~JS
  const action = String(params.action || 'encode').toLowerCase();
  const text = String(params.text || '');
  if (action === 'encode') return { result: btoa(text), action: 'encode' };
  if (action === 'decode') {
    try { return { result: atob(text), action: 'decode' }; }
    catch (e) { return { error: 'base64 inválido', message: e.message }; }
  }
  return { error: "action deve ser 'encode' ou 'decode'" };
JS

utilidades = Tool.find_or_initialize_by(slug: 'utilidades-brasil')
utilidades.assign_attributes(
  name: 'Utilidades Brasil',
  description: 'Conjunto de funções utilitárias para o Brasil: validação de ' \
               'documentos, consulta de CEP, formatação de telefone e mais.',
  image_url: nil,
  icon: 'solar:flag-bold-duotone',
  color: '#16a34a',
  category: 'utilities',
  active: true,
  credentials_schema: [],
  function_templates: [
    {
      'name' => 'validate_cpf_cnpj',
      'description' => 'Valida CPF ou CNPJ aplicando os dígitos verificadores. ' \
                       'Retorna { valid, kind: cpf|cnpj|unknown, normalized }.',
      'parameters' => [
        { 'name' => 'document', 'type' => 'string', 'required' => true,
          'description' => 'O CPF ou CNPJ a validar (aceita com ou sem máscara)' }
      ],
      'js_code' => VALIDATE_CPF_CNPJ_JS
    },
    {
      'name' => 'lookup_cep',
      'description' => 'Consulta o endereço de um CEP brasileiro via API pública ViaCEP.',
      'parameters' => [
        { 'name' => 'cep', 'type' => 'string', 'required' => true,
          'description' => 'CEP de 8 dígitos (com ou sem hífen)' }
      ],
      'js_code' => LOOKUP_CEP_JS
    },
    {
      'name' => 'calculate_age',
      'description' => 'Calcula a idade em anos completos a partir de uma data de nascimento.',
      'parameters' => [
        { 'name' => 'birth_date', 'type' => 'string', 'required' => true,
          'description' => 'Data de nascimento no formato YYYY-MM-DD' }
      ],
      'js_code' => CALCULATE_AGE_JS
    },
    {
      'name' => 'format_phone_br',
      'description' => 'Normaliza um telefone brasileiro para E.164 (+55…) e formato visual.',
      'parameters' => [
        { 'name' => 'phone', 'type' => 'string', 'required' => true,
          'description' => 'Telefone com ou sem máscara, com ou sem DDI 55' }
      ],
      'js_code' => FORMAT_PHONE_BR_JS
    },
    {
      'name' => 'base64_encode_decode',
      'description' => 'Codifica ou decodifica um texto em base64.',
      'parameters' => [
        { 'name' => 'text',   'type' => 'string', 'required' => true,
          'description' => 'Texto a transformar' },
        { 'name' => 'action', 'type' => 'string', 'required' => true,
          'description' => "'encode' ou 'decode'", 'enum' => %w[encode decode] }
      ],
      'js_code' => BASE64_JS
    }
  ]
)
utilidades.save!
puts "[seed:tools] Tool '#{utilidades.name}' com #{utilidades.function_templates.size} funções."
