# Gera os pacotes de tema (CSS) e valida contraste WCAG dos pares principais.
import math, sys

def lum(hexc):
    c = hexc.lstrip('#')
    r, g, b = (int(c[i:i+2], 16) / 255 for i in (0, 2, 4))
    def f(u):
        return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4
    r, g, b = f(r), f(g), f(b)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast(fg, bg):
    l1, l2 = lum(fg), lum(bg)
    if l1 < l2:
        l1, l2 = l2, l1
    return (l1 + 0.05) / (l2 + 0.05)

# Cada tema: tokens (hex). Mesmos nomes de variável do index.css.
THEMES = {
  "oceano": {
    "dark": {
      "background": "#0B1E2B", "foreground": "#E3F3F8",
      "card": "#102635", "popover": "#102635",
      "secondary": "#3EC6B8", "secondary-foreground": "#04231F",
      "accent": "#123A6B", "accent-foreground": "#D9F0FF",
      "primary": "#2FD4FF", "primary-foreground": "#04222E",
      "muted": "#18303F", "muted-foreground": "#92B7C9",
      "border": "#1F4050", "input": "#1F4050", "ring": "#2FD4FF",
      "primary-light": "#7FE4FF", "primary-glow": "#164E63", "accent-red": "#F0658A",
      "editorial-text": "#E3F3F8", "editorial-text-light": "#92B7C9",
      "editorial-tag": "#2FD4FF", "editorial-tag-bg": "#18303F", "editorial-hover": "#132838",
      "gradient-primary": "linear-gradient(135deg, #35E0C8, #2F7DF6)",
      "gradient-hero": "linear-gradient(135deg, #35E0C8 0%, #2FA4FF 45%, #1D3A8F 100%)",
      "gradient-accent": "linear-gradient(90deg, #35E0C8, #2FD4FF, #2F7DF6)",
      "font-heading-weight": "700",
    },
    "light": {
      "background": "#E9F4F8", "foreground": "#16324A",
      "card": "#F6FCFE", "popover": "#F6FCFE",
      "secondary": "#D5E8EE", "secondary-foreground": "#17394A",
      "accent": "#0D3A54", "accent-foreground": "#E3F4FB",
      "primary": "#1268AF", "primary-foreground": "#F2FAFF",
      "muted": "#DCEAEF", "muted-foreground": "#48697A",
      "border": "#C4D8E0", "input": "#C4D8E0", "ring": "#1268AF",
      "primary-light": "#5FA8D3", "primary-glow": "#BFE3F0", "accent-red": "#C2410C",
      "editorial-text": "#16324A", "editorial-text-light": "#48697A",
      "editorial-tag": "#1268AF", "editorial-tag-bg": "#DCEAEF", "editorial-hover": "#DFECEF",
      "gradient-primary": "linear-gradient(135deg, #2BA8C4, #1268AF)",
      "gradient-hero": "linear-gradient(135deg, #35C4B5 0%, #2F8FD8 45%, #1D3A8F 100%)",
      "gradient-accent": "linear-gradient(90deg, #2BA8C4, #1268AF, #0D3A54)",
      "font-heading-weight": "700",
    },
  },
  "pitaya": {
    "dark": {
      "background": "#22101E", "foreground": "#FBE9F2",
      "card": "#2C1628", "popover": "#2C1628",
      "secondary": "#F0825C", "secondary-foreground": "#2B0E02",
      "accent": "#E34FD4", "accent-foreground": "#2C0526",
      "primary": "#FF5CA8", "primary-foreground": "#2B0718",
      "muted": "#371E32", "muted-foreground": "#CB9DAF",
      "border": "#452B3E", "input": "#452B3E", "ring": "#FF5CA8",
      "primary-light": "#FF8FC3", "primary-glow": "#5C1440", "accent-red": "#FF6B4A",
      "editorial-text": "#FBE9F2", "editorial-text-light": "#CB9DAF",
      "editorial-tag": "#FF5CA8", "editorial-tag-bg": "#371E32", "editorial-hover": "#2B1524",
      "gradient-primary": "linear-gradient(135deg, #FF6EC7, #F0825C)",
      "gradient-hero": "linear-gradient(135deg, #FF6EC7 0%, #FF4D94 45%, #8B1E6B 100%)",
      "gradient-accent": "linear-gradient(90deg, #FF6EC7, #FF5CA8, #F0825C)",
      "font-heading-weight": "700",
    },
    "light": {
      "background": "#FBEFF5", "foreground": "#3A2130",
      "card": "#FFF8FB", "popover": "#FFF8FB",
      "secondary": "#F6D8E1", "secondary-foreground": "#4A1626",
      "accent": "#8A2450", "accent-foreground": "#FDE3EE",
      "primary": "#C42768", "primary-foreground": "#FFF0F6",
      "muted": "#F0DEE6", "muted-foreground": "#6F5561",
      "border": "#E0C6D2", "input": "#E0C6D2", "ring": "#C42768",
      "primary-light": "#E578A3", "primary-glow": "#F6C6D8", "accent-red": "#BE123C",
      "editorial-text": "#3A2130", "editorial-text-light": "#6F5561",
      "editorial-tag": "#C42768", "editorial-tag-bg": "#F0DEE6", "editorial-hover": "#F3E3EA",
      "gradient-primary": "linear-gradient(135deg, #E5599B, #C42768)",
      "gradient-hero": "linear-gradient(135deg, #F472B6 0%, #C42768 45%, #6E1339 100%)",
      "gradient-accent": "linear-gradient(90deg, #E5599B, #C42768, #8A2450)",
      "font-heading-weight": "700",
    },
  },
  "uva": {
    "dark": {
      "background": "#17102A", "foreground": "#EFEAFB",
      "card": "#1F1736", "popover": "#1F1736",
      "secondary": "#8F7CF0", "secondary-foreground": "#16102E",
      "accent": "#E879F9", "accent-foreground": "#2A0530",
      "primary": "#A96CFF", "primary-foreground": "#1D1030",
      "muted": "#281E45", "muted-foreground": "#ACA0D0",
      "border": "#35294F", "input": "#35294F", "ring": "#A96CFF",
      "primary-light": "#C4A5FF", "primary-glow": "#3B2264", "accent-red": "#FB7185",
      "editorial-text": "#EFEAFB", "editorial-text-light": "#ACA0D0",
      "editorial-tag": "#A96CFF", "editorial-tag-bg": "#281E45", "editorial-hover": "#1D1633",
      "gradient-primary": "linear-gradient(135deg, #B07CFF, #7C3AED)",
      "gradient-hero": "linear-gradient(135deg, #C4B5FD 0%, #A96CFF 40%, #7C3AED 75%, #4C1D95 100%)",
      "gradient-accent": "linear-gradient(90deg, #C4B5FD, #A96CFF, #E879F9)",
      "font-heading-weight": "700",
    },
    "light": {
      "background": "#F1EDFA", "foreground": "#251B3E",
      "card": "#FAF8FE", "popover": "#FAF8FE",
      "secondary": "#E2DCF0", "secondary-foreground": "#2E2352",
      "accent": "#4C1D95", "accent-foreground": "#EDE9FE",
      "primary": "#6D28D9", "primary-foreground": "#F7F3FF",
      "muted": "#E2DCF0", "muted-foreground": "#5B547A",
      "border": "#CFC5E4", "input": "#CFC5E4", "ring": "#6D28D9",
      "primary-light": "#8B5CF6", "primary-glow": "#DDD0FA", "accent-red": "#BE123C",
      "editorial-text": "#251B3E", "editorial-text-light": "#5B547A",
      "editorial-tag": "#6D28D9", "editorial-tag-bg": "#E2DCF0", "editorial-hover": "#E7E3F3",
      "gradient-primary": "linear-gradient(135deg, #8B5CF6, #6D28D9)",
      "gradient-hero": "linear-gradient(135deg, #A78BFA 0%, #6D28D9 45%, #3B0764 100%)",
      "gradient-accent": "linear-gradient(90deg, #A78BFA, #6D28D9, #4C1D95)",
      "font-heading-weight": "700",
    },
  },
  "esmeralda": {
    "dark": {
      "background": "#0E1F16", "foreground": "#EAF7EE",
      "card": "#142A1F", "popover": "#142A1F",
      "secondary": "#A3E635", "secondary-foreground": "#1A2E00",
      "accent": "#2DD4BF", "accent-foreground": "#052A26",
      "primary": "#3EE08F", "primary-foreground": "#052A16",
      "muted": "#1B3428", "muted-foreground": "#8FB89E",
      "border": "#24402F", "input": "#24402F", "ring": "#3EE08F",
      "primary-light": "#86EFAC", "primary-glow": "#14532D", "accent-red": "#FB7185",
      "editorial-text": "#EAF7EE", "editorial-text-light": "#8FB89E",
      "editorial-tag": "#3EE08F", "editorial-tag-bg": "#1B3428", "editorial-hover": "#122419",
      "gradient-primary": "linear-gradient(135deg, #4ADE80, #0D9488)",
      "gradient-hero": "linear-gradient(135deg, #84CC16 0%, #34D399 40%, #0F766E 100%)",
      "gradient-accent": "linear-gradient(90deg, #84CC16, #3EE08F, #2DD4BF)",
      "font-heading-weight": "700",
    },
    "light": {
      "background": "#EDF7EF", "foreground": "#12301F",
      "card": "#F8FEF9", "popover": "#F8FEF9",
      "secondary": "#D6EBDD", "secondary-foreground": "#153826",
      "accent": "#0F766E", "accent-foreground": "#ECFDF7",
      "primary": "#15803D", "primary-foreground": "#F2FDF6",
      "muted": "#DCEDE1", "muted-foreground": "#476B54",
      "border": "#C0DBC9", "input": "#C0DBC9", "ring": "#15803D",
      "primary-light": "#22C55E", "primary-glow": "#C9E9D2", "accent-red": "#BE123C",
      "editorial-text": "#12301F", "editorial-text-light": "#476B54",
      "editorial-tag": "#15803D", "editorial-tag-bg": "#DCEDE1", "editorial-hover": "#DFEEE4",
      "gradient-primary": "linear-gradient(135deg, #22C55E, #15803D)",
      "gradient-hero": "linear-gradient(135deg, #4ADE80 0%, #16A34A 45%, #14532D 100%)",
      "gradient-accent": "linear-gradient(90deg, #4ADE80, #15803D, #0F766E)",
      "font-heading-weight": "700",
    },
  },
  "americana": {
    "dark": {
      "background": "#0B2233", "foreground": "#EAE2B7",
      "card": "#12293C", "popover": "#12293C",
      "secondary": "#FCBF49", "secondary-foreground": "#2A1A00",
      "accent": "#C61F1F", "accent-foreground": "#FFF0D8",
      "primary": "#F77F00", "primary-foreground": "#241200",
      "muted": "#17334A", "muted-foreground": "#B9B39B",
      "border": "#23405A", "input": "#23405A", "ring": "#F77F00",
      "primary-light": "#FDA854", "primary-glow": "#5C3603", "accent-red": "#FF5A3C",
      "editorial-text": "#EAE2B7", "editorial-text-light": "#B9B39B",
      "editorial-tag": "#F77F00", "editorial-tag-bg": "#17334A", "editorial-hover": "#142B40",
      "gradient-primary": "linear-gradient(135deg, #FCBF49, #F77F00)",
      "gradient-hero": "linear-gradient(135deg, #FCBF49 0%, #F77F00 40%, #C81E1E 75%, #003049 100%)",
      "gradient-accent": "linear-gradient(90deg, #FCBF49, #F77F00, #C81E1E)",
      "font-heading-weight": "700",
    },
    "light": {
      "background": "#EAE2B7", "foreground": "#22303F",
      "card": "#F2EBC9", "popover": "#F4EECC",
      "secondary": "#F77F00", "secondary-foreground": "#2B1200",
      "accent": "#003049", "accent-foreground": "#EAE2B7",
      "primary": "#C81E1E", "primary-foreground": "#FAEFD2",
      "muted": "#DED3A6", "muted-foreground": "#57503C",
      "border": "#CBBE8E", "input": "#CBBE8E", "ring": "#C81E1E",
      "primary-light": "#E8684A", "primary-glow": "#F6CFC0", "accent-red": "#B91C1C",
      "editorial-text": "#22303F", "editorial-text-light": "#57503C",
      "editorial-tag": "#C81E1E", "editorial-tag-bg": "#DED3A6", "editorial-hover": "#E3D8AC",
      "gradient-primary": "linear-gradient(135deg, #F77F00, #C81E1E)",
      "gradient-hero": "linear-gradient(135deg, #FCBF49 0%, #F77F00 35%, #C81E1E 70%, #003049 100%)",
      "gradient-accent": "linear-gradient(90deg, #F77F00, #C81E1E, #003049)",
      "font-heading-weight": "700",
    },
  },
  "feira": {
    "dark": {
      "background": "#101D11", "foreground": "#F3E8CC",
      "card": "#16261A", "popover": "#16261A",
      "secondary": "#F96015", "secondary-foreground": "#261000",
      "accent": "#C41F10", "accent-foreground": "#FFF1E2",
      "primary": "#FFC926", "primary-foreground": "#241A00",
      "muted": "#1E3223", "muted-foreground": "#A9BD97",
      "border": "#2A4030", "input": "#2A4030", "ring": "#FFC926",
      "primary-light": "#FFDE6B", "primary-glow": "#5C4A00", "accent-red": "#FF6B3D",
      "editorial-text": "#F3E8CC", "editorial-text-light": "#A9BD97",
      "editorial-tag": "#FFC926", "editorial-tag-bg": "#1E3223", "editorial-hover": "#132316",
      "gradient-primary": "linear-gradient(135deg, #FFC926, #F96015)",
      "gradient-hero": "linear-gradient(135deg, #FFC926 0%, #F96015 40%, #C41F10 70%, #18542A 100%)",
      "gradient-accent": "linear-gradient(90deg, #FFC926, #F96015, #C41F10)",
      "font-heading-weight": "700",
    },
    "light": {
      "background": "#F3E8CC", "foreground": "#23301F",
      "card": "#FBF6E4", "popover": "#FCF8E9",
      "secondary": "#F96015", "secondary-foreground": "#2A0E00",
      "accent": "#18542A", "accent-foreground": "#F3E8CC",
      "primary": "#C41F10", "primary-foreground": "#FBF3DF",
      "muted": "#E4D8B4", "muted-foreground": "#575031",
      "border": "#D3C59B", "input": "#D3C59B", "ring": "#C41F10",
      "primary-light": "#F96015", "primary-glow": "#F5CBA8", "accent-red": "#B91C1C",
      "editorial-text": "#23301F", "editorial-text-light": "#575031",
      "editorial-tag": "#C41F10", "editorial-tag-bg": "#E4D8B4", "editorial-hover": "#E9DFC0",
      "gradient-primary": "linear-gradient(135deg, #F96015, #C41F10)",
      "gradient-hero": "linear-gradient(135deg, #FFC926 0%, #F96015 35%, #C41F10 65%, #18542A 100%)",
      "gradient-accent": "linear-gradient(90deg, #FFC926, #F96015, #C41F10)",
      "font-heading-weight": "700",
    },
  },
  "botanica": {
    "dark": {
      "background": "#1F2420", "foreground": "#F3D5CE",
      "card": "#272D28", "popover": "#272D28",
      "secondary": "#DA9FA1", "secondary-foreground": "#2E1216",
      "accent": "#FAD91D", "accent-foreground": "#241C00",
      "primary": "#F29033", "primary-foreground": "#2A1503",
      "muted": "#2E362F", "muted-foreground": "#A9B2A7",
      "border": "#39423A", "input": "#39423A", "ring": "#F29033",
      "primary-light": "#F7A95C", "primary-glow": "#5C3603", "accent-red": "#FF6B4A",
      "editorial-text": "#F3D5CE", "editorial-text-light": "#A9B2A7",
      "editorial-tag": "#F29033", "editorial-tag-bg": "#2E362F", "editorial-hover": "#242B26",
      "gradient-primary": "linear-gradient(135deg, #FAD91D, #F29033)",
      "gradient-hero": "linear-gradient(135deg, #FAD91D 0%, #F29033 40%, #C1553B 70%, #4A2B47 100%)",
      "gradient-accent": "linear-gradient(90deg, #FAD91D, #F29033, #DA9FA1)",
      "font-heading-weight": "700",
    },
    "light": {
      "background": "#F3ECE2", "foreground": "#2A211B",
      "card": "#FDF9EF", "popover": "#FEFAF2",
      "secondary": "#6A3250", "secondary-foreground": "#F6E4DE",
      "accent": "#0B4417", "accent-foreground": "#E9F3EA",
      "primary": "#B44E0B", "primary-foreground": "#FDEFE3",
      "muted": "#E2D7CB", "muted-foreground": "#5F5347",
      "border": "#D4C7B6", "input": "#D4C7B6", "ring": "#B44E0B",
      "primary-light": "#D97B2F", "primary-glow": "#EBD8C2", "accent-red": "#BE123C",
      "editorial-text": "#2A211B", "editorial-text-light": "#6E6156",
      "editorial-tag": "#B44E0B", "editorial-tag-bg": "#E2D7CB", "editorial-hover": "#E7DECF",
      "gradient-primary": "linear-gradient(135deg, #D97B2F, #B44E0B)",
      "gradient-hero": "linear-gradient(135deg, #E8A33D 0%, #B44E0B 40%, #6A3250 75%, #0B4417 100%)",
      "gradient-accent": "linear-gradient(90deg, #D97B2F, #B44E0B, #6A3250)",
      "font-heading-weight": "700",
    },
  },
  "pedro": {
    "dark": {
      "background": "#241019", "foreground": "#FBE0EA",
      "card": "#2E1722", "popover": "#2E1722",
      "secondary": "#F194B6", "secondary-foreground": "#33101F",
      "accent": "#F2B33D", "accent-foreground": "#2A1A00",
      "primary": "#FF5FA2", "primary-foreground": "#2B0716",
      "muted": "#38202C", "muted-foreground": "#CDA0AF",
      "border": "#472A38", "input": "#472A38", "ring": "#FF5FA2",
      "primary-light": "#FF8FBE", "primary-glow": "#571B34", "accent-red": "#FF7AB0",
      "editorial-text": "#FBE0EA", "editorial-text-light": "#CDA0AF",
      "editorial-tag": "#FF5FA2", "editorial-tag-bg": "#38202C", "editorial-hover": "#2B1520",
      "gradient-primary": "linear-gradient(135deg, #FF5FA2, #C92460)",
      "gradient-hero": "linear-gradient(135deg, #FF8FBF 0%, #FF5FA2 30%, #C92460 62%, #6E1030 100%)",
      "gradient-accent": "linear-gradient(90deg, #FF8FBF, #FF5FA2, #F2B33D)",
      "font-heading-weight": "800",
    },
    "light": {
      "background": "#EEDBCB", "foreground": "#33201A",
      "card": "#F7EDE1", "popover": "#F9EFE5",
      "secondary": "#F2A9BD", "secondary-foreground": "#4A1024",
      "accent": "#A5234E", "accent-foreground": "#FBE4EC",
      "primary": "#C92460", "primary-foreground": "#FDEDF4",
      "muted": "#E3D2C1", "muted-foreground": "#5F4D43",
      "border": "#D8C2B1", "input": "#D8C2B1", "ring": "#C92460",
      "primary-light": "#E578A3", "primary-glow": "#F6C6D3", "accent-red": "#BE123C",
      "editorial-text": "#33201A", "editorial-text-light": "#6F5A50",
      "editorial-tag": "#C92460", "editorial-tag-bg": "#E3D2C1", "editorial-hover": "#E7D9CB",
      "gradient-primary": "linear-gradient(135deg, #E8558D, #C92460)",
      "gradient-hero": "linear-gradient(135deg, #F277A8 0%, #C92460 40%, #A5234E 70%, #571B34 100%)",
      "gradient-accent": "linear-gradient(90deg, #F277A8, #C92460, #A5234E)",
      "font-heading-weight": "800",
    },
  },
}

def check():
    failures = []
    for name, modes in THEMES.items():
        for mode, t in modes.items():
            pairs = [
                ("background", "foreground", 4.5),
                ("card", "foreground", 4.5),
                ("background", "muted-foreground", 4.5),
                ("card", "muted-foreground", 4.5),
                ("primary", "primary-foreground", 4.5),
                ("secondary", "secondary-foreground", 4.5),
                ("accent", "accent-foreground", 4.5),
                ("editorial-tag-bg", "editorial-tag", 3.0),
                ("muted", "muted-foreground", 4.5),
            ]
            for bg_key, fg_key, min_c in pairs:
                ratio = contrast(t[fg_key], t[bg_key])
                ok = ratio >= min_c
                if not ok:
                    failures.append(f"{name}/{mode}: {fg_key} on {bg_key} = {ratio:.2f} (min {min_c})")
    return failures

fails = check()
if fails:
    print("CONTRAST FAILURES:")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print("contrast OK — all pairs pass")


CSS_ORDER = [
    ("background", "--color-background"), ("foreground", "--color-foreground"),
    ("card", "--color-card"), ("foreground", "--color-card-foreground"),
    ("popover", "--color-popover"), ("foreground", "--color-popover-foreground"),
    ("primary", "--color-primary"), ("primary-foreground", "--color-primary-foreground"),
    ("secondary", "--color-secondary"), ("secondary-foreground", "--color-secondary-foreground"),
    ("accent", "--color-accent"), ("accent-foreground", "--color-accent-foreground"),
    ("muted", "--color-muted"), ("muted-foreground", "--color-muted-foreground"),
    ("border", "--color-border"), ("input", "--color-input"), ("ring", "--color-ring"),
    ("primary-light", "--primary-light"), ("primary-glow", "--primary-glow"), ("accent-red", "--accent-red"),
    ("editorial-text", "--editorial-text"), ("editorial-text-light", "--editorial-text-light"),
    ("editorial-tag", "--editorial-tag"), ("editorial-tag-bg", "--editorial-tag-bg"), ("editorial-hover", "--editorial-hover"),
    ("gradient-primary", "--gradient-primary"), ("gradient-hero", "--gradient-hero"), ("gradient-accent", "--gradient-accent"),
    ("font-heading-weight", "--font-heading-weight"),
]

def emit():
    out = []
    titles = {
        "oceano": ("OCEANO — ciano/azul elétrico", "cores frias e elétricas"),
        "pitaya": ("PITAYA — rosa choque", "rosa vivo com coral e magenta"),
        "uva": ("UVA — violeta elétrico", "violeta com gradientes lilás–magenta"),
        "esmeralda": ("ESMERALDA — verde vívido", "verde com limão e teal"),
        "americana": ("AMERICANA — rota 66", "vanila custard, tangerina, vermelho bandeira e azul espacial"),
        "feira": ("FEIRA LIVRE — retrô de mercado", "sol, laranja cenoura, vermelho tomate e verde floresta"),
        "botanica": ("BOTÂNICA — apothecary", "laranja terracota, ameixa seca e sálvia sobre carvão quente"),
        "pedro": ("PEDRO — rosa BOLD (feito para o Pedro)", "rosa framboesa sobre creme, inspirado nos rótulos da The Boldest Co."),
    }
    for name, modes in THEMES.items():
        title = titles[name][0]
        out.append(f"""/* ---------- {title} ---------- */""")
        for mode in ("dark", "light"):
            t = modes[mode]
            selector = f"html.theme-{name}" if mode == "dark" else f"html.light.theme-{name},\nhtml.theme-{name}.light"
            out.append(f"{selector} {{")
            seen = {}
            for key, var in CSS_ORDER:
                if key in t:
                    out.append(f"  {var}: {t[key]};")
            out.append("}")
        out.append("")
    return "\n".join(out)

if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "emit":
    print(emit())
