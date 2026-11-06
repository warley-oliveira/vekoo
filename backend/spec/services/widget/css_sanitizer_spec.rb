require "rails_helper"

RSpec.describe Widget::CssSanitizer do
  describe ".call" do
    it "devolve texto vazio para entrada vazia" do
      expect(described_class.call(nil)).to eq("")
      expect(described_class.call("")).to eq("")
    end

    it "mantém regras comuns e url() de imagem" do
      css = ".vekoo-widget .bubble { background: #fafafa url(https://cdn.loja.com/bg.png); border-radius: 8px; }"

      expect(described_class.call(css)).to eq(css)
    end

    it "tira @import, em qualquer caixa" do
      expect(described_class.call("@import url('http://evil.com/x.css'); .a{color:red}")).not_to include("@import")
      expect(described_class.call("@IMPORT url(x.css); .a{}")).not_to match(/@import/i)
    end

    it "tira expression()" do
      expect(described_class.call(".a{width: expression(alert(1))}")).not_to match(/expression\s*\(/i)
    end

    it "tira -moz-binding e behavior" do
      out = described_class.call(".a{-moz-binding:url(x.xml); behavior:url(x.htc)}")

      expect(out).not_to include("-moz-binding")
      expect(out).not_to match(/behavior\s*:/i)
    end

    it "tira URLs javascript:" do
      expect(described_class.call(".a{background:url(javascript:alert(1))}")).not_to match(/javascript\s*:/i)
    end

    it "tira sequências de fechamento de tag, que confundiriam o <style>" do
      expect(described_class.call(".a{}</style><script>x</script>")).not_to include("</")
    end

    it "tira caracteres de controle" do
      input = ".a{}#{0.chr}#{7.chr}color:red"

      expect(described_class.call(input)).to eq(".a{}color:red")
    end

    it "corta no tamanho máximo" do
      out = described_class.call("a" * (described_class::MAX_LENGTH + 500))

      expect(out.length).to eq(described_class::MAX_LENGTH)
    end

    it "aceita o tamanho máximo exato sem cortar nada" do
      out = described_class.call("a" * described_class::MAX_LENGTH)

      expect(out.length).to eq(described_class::MAX_LENGTH)
    end

    it "tira espaços das pontas" do
      expect(described_class.call("  .a{}  ")).to eq(".a{}")
    end
  end
end
