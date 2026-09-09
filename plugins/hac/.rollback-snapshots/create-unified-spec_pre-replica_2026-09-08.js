  if (msg.type === "create-unified-spec") {
    (async () => {
      const opts = msg.opts;
      let node = null;
      if (opts.targetNodeId) {
        node = await figma.getNodeByIdAsync(opts.targetNodeId);
      }
      if (!node) {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
          figma.notify("Selecione um elemento no canvas.");
          return;
        }
        node = selection[0];
      }

      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) { }
      try { await figma.loadFontAsync({ family: "Inter", style: "Medium" }); } catch (e) { }
      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }

      const themeColor = hexToRgb(opts.color || '#005ca9');
      const themeFill  = hexToRgb(opts.fillColor || opts.color || '#EBF4FB');
      const _specSide = opts.guideSide || 'right';
      const _tagRadius = 21; // selos de A11y são círculos cheios no material da vertical
      const _layerTag = 'SpecA11y';

      let specCard = null;
      let _a11yImportFailReason = null;
      try {
        specCard = await _tryImportA11yComponent(opts);
        specCard.name = 'Spec Notes';
        try { specCard.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }]; } catch (e) { }
        try {
          if ('paddingLeft' in specCard) {
            specCard.paddingLeft = 12;
            specCard.paddingRight = 12;
            specCard.paddingTop = 12;
            specCard.paddingBottom = 12;
          }
        } catch (e) { }
      } catch (e) {
        specCard = null;
        _a11yImportFailReason = e && e.message ? e.message : String(e);
      }

      // Fallbacks ESPERADOS: variação sem componente real catalogado — não é
      // erro de biblioteca, cai no card procedural normalmente.
      const _A11Y_EXPECTED_FALLBACK_PREFIXES = [
        'a11y-elemento-outro-sem-componente-real',
        'a11y-titulo-mobile-sem-variante-real',
        'a11y-informacoes-customizavel-sem-variante-real',
        'a11y-estrutura-variacao-sem-import-real',
        'a11y-estrutura-marco-customizavel-sem-conteudo-catalogado',
      ];
      const _isExpectedFallback = _a11yImportFailReason && _A11Y_EXPECTED_FALLBACK_PREFIXES.some(p => _a11yImportFailReason.startsWith(p));
      if (_a11yImportFailReason && !_isExpectedFallback) {
        figma.notify('Não foi possível criar a especificação de acessibilidade. (' + _a11yImportFailReason + ')', { error: true });
        return;
      }

      if (!specCard) {
        specCard = figma.createFrame();
        specCard.name = 'Spec Notes';
        specCard.layoutMode = "VERTICAL";
        specCard.paddingLeft = 12;
        specCard.paddingRight = 12;
        specCard.paddingTop = 12;
        specCard.paddingBottom = 12;
        specCard.itemSpacing = 12;
        specCard.cornerRadius = 8;
        specCard.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
        specCard.strokes = [{ type: "SOLID", color: themeColor }];
        specCard.strokeWeight = 1.5;
        specCard.primaryAxisSizingMode = "AUTO";
        specCard.counterAxisSizingMode = "AUTO";

        const headerRow = figma.createFrame();
        headerRow.layoutMode = "HORIZONTAL";
        headerRow.itemSpacing = 8;
        headerRow.fills = [];
        headerRow.primaryAxisSizingMode = "AUTO";
        headerRow.counterAxisSizingMode = "AUTO";

        const tagCircle = figma.createFrame();
        tagCircle.name = 'Tag';
        tagCircle.layoutMode = "HORIZONTAL";
        tagCircle.primaryAxisSizingMode = "FIXED";
        tagCircle.counterAxisSizingMode = "FIXED";
        tagCircle.resize(42, 42);
        tagCircle.cornerRadius = _tagRadius;
        tagCircle.fills = [{ type: "SOLID", color: themeFill }];
        tagCircle.strokes = [{ type: "SOLID", color: themeColor }];
        tagCircle.strokeWeight = 1.5;
        tagCircle.primaryAxisAlignItems = "CENTER";
        tagCircle.counterAxisAlignItems = "CENTER";
        const tagText = figma.createText();
        tagText.fontName = { family: "Inter", style: "Bold" };
        tagText.fontSize = 18;
        tagText.fills = [{ type: "SOLID", color: themeColor }];
        tagText.characters = opts.letter;
        tagCircle.appendChild(tagText);
        headerRow.appendChild(tagCircle);

        headerRow.counterAxisAlignItems = "CENTER";

        const title = figma.createText();
        title.fontName = { family: "Inter", style: "Bold" };
        title.fontSize = 12;
        title.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
        title.characters = node.name;
        headerRow.appendChild(title);
        specCard.appendChild(headerRow);

        if (opts.categoryLabel) {
          const pill = figma.createFrame();
          pill.name = `Categoria/${opts.categoryLabel}`;
          pill.layoutMode = "HORIZONTAL";
          pill.paddingLeft = 8; pill.paddingRight = 8;
          pill.paddingTop = 4; pill.paddingBottom = 4;
          pill.cornerRadius = 12;
          pill.primaryAxisSizingMode = "AUTO";
          pill.counterAxisSizingMode = "AUTO";
          pill.fills = [{ type: "SOLID", color: themeFill }];
          pill.strokes = [{ type: "SOLID", color: themeColor }];
          const pillText = figma.createText();
          pillText.fontName = { family: "Inter", style: "Medium" };
          pillText.fontSize = 10;
          pillText.fills = [{ type: "SOLID", color: themeColor }];
          pillText.characters = opts.categoryLabel;
          pill.appendChild(pillText);
          specCard.appendChild(pill);
        }

        if (opts.note) {
          const desc = figma.createText();
          desc.fontName = { family: "Inter", style: "Regular" };
          desc.fontSize = 11;
          desc.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
          desc.characters = opts.note;
          desc.textAutoResize = "WIDTH_AND_HEIGHT";
          specCard.appendChild(desc);
        }

        if (opts.properties && opts.properties.length > 0) {
          const propsFrame = figma.createFrame();
          propsFrame.layoutMode = "VERTICAL";
          propsFrame.itemSpacing = 4;
          propsFrame.fills = [];
          propsFrame.primaryAxisSizingMode = "AUTO";
          propsFrame.counterAxisSizingMode = "AUTO";
          propsFrame.name = 'Propriedades';
          propsFrame.layoutAlign = "INHERIT";

          opts.properties.forEach(p => {
            const row = figma.createFrame();
            row.name = `Prop/${p.label}`;
            row.layoutMode = "HORIZONTAL";
            row.itemSpacing = 12;
            row.fills = [];
            row.primaryAxisSizingMode = "AUTO";
            row.counterAxisSizingMode = "AUTO";
            row.layoutAlign = "INHERIT";
            row.counterAxisAlignItems = "CENTER";

            const pLabel = figma.createText();
            pLabel.fontName = { family: "Inter", style: "Medium" };
            pLabel.fontSize = 10;
            pLabel.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }];
            pLabel.characters = p.label.toUpperCase();
            pLabel.textAutoResize = "WIDTH_AND_HEIGHT";

            const pVal = figma.createText();
            pVal.fontName = { family: "Inter", style: "Bold" };
            pVal.fontSize = 11;
            pVal.fills = [{ type: "SOLID", color: p.token ? themeColor : { r: 0.1, g: 0.1, b: 0.1 } }];
            pVal.characters = p.token || String(p.value);
            pVal.textAutoResize = "WIDTH_AND_HEIGHT";

            row.appendChild(pLabel);
            row.appendChild(pVal);

            propsFrame.appendChild(row);
          });
          specCard.appendChild(propsFrame);
        }

        if (opts.link) {
          const linkTxt = figma.createText();
          linkTxt.fontName = { family: "Inter", style: "Regular" };
          linkTxt.fontSize = 11;
          linkTxt.fills = [{ type: "SOLID", color: { r: 0, g: 0.4, b: 0.8 } }];
          linkTxt.characters = opts.link;
          linkTxt.textDecoration = "UNDERLINE";
          linkTxt.hyperlink = { type: "URL", value: opts.link };
          linkTxt.textAutoResize = "HEIGHT";
          linkTxt.layoutAlign = "STRETCH";
          specCard.appendChild(linkTxt);
        }
      } // fim do fallback procedural (if (!specCard))

      let groupNodes = [];
      let _absCardX = 0, _absCardY = 0, _absCardW = 0, _absCardH = 0;
      let _markerImportFailReason = null;

      const bounds = node.absoluteBoundingBox || node.absoluteRenderBounds;
      if (bounds) {
        let marker = null;
        try {
          marker = opts.drawMode === 'linha'
            ? await _tryImportA11yConectorLinha(opts)
            : await _tryImportA11yAgrupamento(opts);
        } catch (e) {
          // Fallback brando: NÃO aborta a spec inteira (o card já foi criado
          // com sucesso acima, seja o componente real ou o procedural). Uma
          // combinação categoria/orientação sem marcador catalogado — ou uma
          // falha pontual de importComponentByKeyAsync (rede/lib
          // desconectada) — não deveria impedir o designer de documentar o
          // elemento; ele fica sem o contorno/conector visual, mas o card com
          // toda a informação (nome acessível, observações, notas) já existe
          // no canvas e pode ser revisado depois. Segue o fluxo com
          // marker = null; os pontos abaixo já toleram isso.
          marker = null;
          _markerImportFailReason = e && e.message ? e.message : String(e);
        }

        let _markerAnchorBounds = bounds;

        if (marker && opts.drawMode !== 'linha') {
          figma.currentPage.appendChild(marker);
          try {
            marker.resize(Math.max(bounds.width + 32, 40), Math.max(bounds.height + 32, 40));
          } catch (e) { /* variante sem resize livre — segue com o tamanho padrão */ }
          marker.x = Math.round(bounds.x - 16);
          marker.y = Math.round(bounds.y - 16);
        } else if (marker) {
          // O componente "Conector" NÃO é simétrico: o selo fica numa ponta e
          // a linha se estende até a outra, que é o ponto de contato real com
          // o elemento. A ponta de contato é sempre OPOSTA ao lado indicado
          // pelo nome da variante.
          const _side = opts.guideSide || 'right';
          figma.currentPage.appendChild(marker);
          if (_side === 'right') { marker.x = bounds.x + bounds.width; marker.y = bounds.y + bounds.height / 2 - marker.height / 2; }
          else if (_side === 'left') { marker.x = bounds.x - marker.width; marker.y = bounds.y + bounds.height / 2 - marker.height / 2; }
          else if (_side === 'top') { marker.x = bounds.x + bounds.width / 2 - marker.width / 2; marker.y = bounds.y - marker.height; }
          else { marker.x = bounds.x + bounds.width / 2 - marker.width / 2; marker.y = bounds.y + bounds.height; }
        }
        if (marker) {
          groupNodes.push(marker);
          _markerAnchorBounds = marker.absoluteBoundingBox || _markerAnchorBounds;
        }

        figma.currentPage.appendChild(specCard);

        const side = opts.guideSide || 'right';
        const _specLetter = opts.letter;

        let _anchorNode = node;
        while (_anchorNode.parent && _anchorNode.parent.type !== 'PAGE') {
          _anchorNode = _anchorNode.parent;
        }
        const _anchorBounds = _anchorNode.absoluteBoundingBox || bounds;

        const _letterMap = {};
        const _updateLetterMap = (l, bb) => {
          if (!_letterMap[l]) _letterMap[l] = { x: bb.x, topY: bb.y, bottom: bb.y + bb.height, right: bb.x + bb.width };
          if (bb.y + bb.height > _letterMap[l].bottom) _letterMap[l].bottom = bb.y + bb.height;
          if (bb.x + bb.width > _letterMap[l].right) _letterMap[l].right = bb.x + bb.width;
          if (bb.x < _letterMap[l].x) _letterMap[l].x = bb.x;
          if (bb.y < _letterMap[l].topY) _letterMap[l].topY = bb.y;
        };
        // Título usa selo FIXO "H" repetido em elementos diferentes — não
        // alimenta o agrupamento por "mesma tag" (empilharia specs de títulos
        // diferentes uma sobre a outra); cada spec de Título posiciona de
        // forma independente. Specs vivem dentro da Section organizadora, por
        // isso escaneamos os filhos dela, não a página inteira.
        const _stackScanNodes = _getOrCreateA11ySection(opts.sectionName).children || [];
        if (opts.a11yType !== 'titulo') _stackScanNodes.forEach(n => {
          if (n.type !== 'GROUP') return;
          const newFmt = n.name.match(new RegExp('^\\[' + _layerTag + ' \\| ([A-Z]\\d*(?:\\.\\d+)*) \\| ([a-z]+)\\] '));
          if (!newFmt) return;
          if (newFmt[2] !== side) return;
          const specNotes = n.children && n.children.find(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && c.name === 'Spec Notes' && c !== specCard);
          if (!specNotes) return;
          const bb = specNotes.absoluteBoundingBox || specNotes.absoluteRenderBounds;
          if (bb) _updateLetterMap(newFmt[1], bb);
        });

        // Specs com Área Marcada (opts.a11yAreaId) ficam organizadas em
        // sub-colunas por CATEGORIA (opts.a11yType) dentro do espaço da área:
        // specs da MESMA área E MESMA categoria empilham na MESMA coluna X;
        // categorias diferentes da mesma área ganham colunas X diferentes,
        // lado a lado. opts.existingAreaSpecIds = irmãs da MESMA
        // área+categoria; opts.existingAreaAllSpecIds = irmãs da área
        // inteira (fallback pra achar a coluna mais à direita já ocupada
        // quando a categoria é nova na área).
        const _areaColKey = opts.a11yAreaId ? `${opts.a11yAreaId}::${opts.a11yType}` : null;
        const _areaMap = {};
        if (opts.a11yAreaId && Array.isArray(opts.existingAreaSpecIds) && opts.existingAreaSpecIds.length > 0) {
          for (const _sid of opts.existingAreaSpecIds) {
            if (!_sid) continue;
            const _sibling = await figma.getNodeByIdAsync(_sid);
            if (!_sibling || _sibling.removed) continue;
            const _siblingNotes = _sibling.children && _sibling.children.find(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && c.name === 'Spec Notes');
            const _bb = (_siblingNotes && (_siblingNotes.absoluteBoundingBox || _siblingNotes.absoluteRenderBounds))
              || _sibling.absoluteBoundingBox || _sibling.absoluteRenderBounds;
            if (!_bb) continue;
            if (!_areaMap[_areaColKey]) {
              _areaMap[_areaColKey] = { x: _bb.x, topY: _bb.y, bottom: _bb.y + _bb.height, right: _bb.x + _bb.width };
            } else {
              const _a = _areaMap[_areaColKey];
              if (_bb.y + _bb.height > _a.bottom) _a.bottom = _bb.y + _bb.height;
              if (_bb.x + _bb.width > _a.right) _a.right = _bb.x + _bb.width;
              if (_bb.x < _a.x) _a.x = _bb.x;
              if (_bb.y < _a.topY) _a.topY = _bb.y;
            }
          }
        }

        let _areaRightmostOtherCategory = null;
        if (opts.a11yAreaId && !_areaMap[_areaColKey] && Array.isArray(opts.existingAreaAllSpecIds) && opts.existingAreaAllSpecIds.length > 0) {
          for (const _sid of opts.existingAreaAllSpecIds) {
            if (!_sid) continue;
            const _sibling = await figma.getNodeByIdAsync(_sid);
            if (!_sibling || _sibling.removed) continue;
            const _siblingNotes = _sibling.children && _sibling.children.find(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && c.name === 'Spec Notes');
            const _bb = (_siblingNotes && (_siblingNotes.absoluteBoundingBox || _siblingNotes.absoluteRenderBounds))
              || _sibling.absoluteBoundingBox || _sibling.absoluteRenderBounds;
            if (!_bb) continue;
            if (!_areaRightmostOtherCategory || _bb.x + _bb.width > _areaRightmostOtherCategory.right) {
              _areaRightmostOtherCategory = { topY: _bb.y, right: _bb.x + _bb.width };
            }
          }
        }

        const _SPEC_GAP = 32;
        const _SPEC_COL_GAP = 64;
        const cardW = specCard.width;
        const cardH = specCard.height;
        let targetX, targetY;

        if (opts.pinnedPosition) {
          // Edição de spec (delete+recreate): mantém a spec exatamente onde
          // estava, sem reempilhar.
          targetX = opts.pinnedPosition.x;
          targetY = opts.pinnedPosition.y;
        } else if (opts.a11yAreaId && _areaMap[_areaColKey]) {
          targetX = _areaMap[_areaColKey].x;
          targetY = _areaMap[_areaColKey].bottom + _SPEC_GAP;
        } else if (opts.a11yAreaId && _areaRightmostOtherCategory) {
          targetX = _areaRightmostOtherCategory.right + _SPEC_COL_GAP;
          targetY = _areaRightmostOtherCategory.topY;
        } else if (_letterMap[_specLetter]) {
          targetX = _letterMap[_specLetter].x;
          if (side === 'top') {
            targetY = _letterMap[_specLetter].topY - cardH - _SPEC_GAP;
          } else {
            targetY = _letterMap[_specLetter].bottom + _SPEC_GAP;
          }
        } else if (Object.keys(_letterMap).length > 0) {
          if (side === 'left') {
            const _leftmost = Object.values(_letterMap).reduce((a, v) => v.x < a.x ? v : a);
            targetX = _leftmost.x - cardW - _SPEC_COL_GAP;
            targetY = _leftmost.topY;
          } else {
            const _rightmost = Object.values(_letterMap).reduce((a, v) => v.right > a.right ? v : a);
            targetX = _rightmost.right + _SPEC_COL_GAP;
            targetY = _rightmost.topY;
          }
        } else {
          if (side === 'right') {
            targetX = _anchorBounds.x + _anchorBounds.width + 100;
            targetY = _anchorBounds.y;
          } else if (side === 'left') {
            targetX = _anchorBounds.x - cardW - 100;
            targetY = _anchorBounds.y;
          } else if (side === 'bottom') {
            targetX = _anchorBounds.x;
            targetY = _anchorBounds.y + _anchorBounds.height + 100;
          } else { // top
            targetX = _anchorBounds.x;
            targetY = _anchorBounds.y - cardH - 100;
          }
        }

        _absCardX = Math.round(targetX);
        _absCardY = Math.round(targetY);
        _absCardW = Math.round(specCard.width);
        _absCardH = Math.round(specCard.height);
        specCard.x = _absCardX;
        specCard.y = _absCardY;
        groupNodes.push(specCard);

        // Modo "Linha": o marcador real importado já É o conector completo
        // (linha + selo embutidos no componente da lib) — não desenha nada
        // mais aqui, senão duplica a linha.
        if (opts.drawConnection !== false && opts.drawMode !== 'linha') {
          const _anchorB = _markerAnchorBounds;
          let startPt, endPt;
          if (side === 'right') {
            startPt = { x: _anchorB.x + _anchorB.width, y: _anchorB.y + _anchorB.height / 2 };
            endPt   = { x: specCard.x, y: specCard.y + specCard.height / 2 };
          } else if (side === 'left') {
            startPt = { x: _anchorB.x, y: _anchorB.y + _anchorB.height / 2 };
            endPt   = { x: specCard.x + specCard.width, y: specCard.y + specCard.height / 2 };
          } else if (side === 'bottom') {
            startPt = { x: _anchorB.x + _anchorB.width / 2, y: _anchorB.y + _anchorB.height };
            endPt   = { x: specCard.x + specCard.width / 2, y: specCard.y };
          } else { // top
            startPt = { x: _anchorB.x + _anchorB.width / 2, y: _anchorB.y };
            endPt   = { x: specCard.x + specCard.width / 2, y: specCard.y + specCard.height };
          }

          const connector = figma.createVector();
          connector.name = 'Conector';
          connector.vectorPaths = [{ windingRule: "NONZERO", data: `M ${startPt.x} ${startPt.y} L ${endPt.x} ${endPt.y}` }];
          connector.strokes = [{ type: "SOLID", color: themeColor }];
          connector.strokeWeight = 1.5;
          connector.dashPattern = [4, 4];
          connector.strokeCap = "ROUND";
          figma.currentPage.appendChild(connector);
          groupNodes.push(connector);

          const _DOT_R = 4;
          const startDot = figma.createEllipse();
          startDot.name = 'DotInicio';
          startDot.resize(_DOT_R * 2, _DOT_R * 2);
          startDot.fills = [{ type: "SOLID", color: themeColor }];
          startDot.strokes = [];
          figma.currentPage.appendChild(startDot);
          startDot.x = startPt.x - _DOT_R;
          startDot.y = startPt.y - _DOT_R;
          groupNodes.push(startDot);

          const endDot = figma.createEllipse();
          endDot.name = 'DotFim';
          endDot.resize(_DOT_R * 2, _DOT_R * 2);
          endDot.fills = [{ type: "SOLID", color: themeColor }];
          endDot.strokes = [];
          figma.currentPage.appendChild(endDot);
          endDot.x = endPt.x - _DOT_R;
          endDot.y = endPt.y - _DOT_R;
          groupNodes.push(endDot);
        }
      } else {
        figma.currentPage.appendChild(specCard);
        _absCardX = Math.round(figma.viewport.center.x);
        _absCardY = Math.round(figma.viewport.center.y);
        _absCardW = Math.round(specCard.width);
        _absCardH = Math.round(specCard.height);
        specCard.x = _absCardX;
        specCard.y = _absCardY;
        groupNodes.push(specCard);
      }

      const specGroup = figma.group(groupNodes, figma.currentPage);
      specGroup.name = `[${_layerTag} | ${opts.letter} | ${_specSide}] ${node.name}`;
      // Specs de A11y nascem travadas — o marcador já é calculado pra
      // contornar o elemento certo, não é pra arrastar/reposicionar. Um
      // cadeado na listagem destrava se precisar.
      specGroup.locked = true;
      specGroup.setPluginData('hacCategory', 'a11y');

      await _reparentArtifactIntoArea(specGroup, opts.a11yAreaId, () => {
        _reparentIntoA11ySection(specGroup, opts.sectionName);
      });

      figma.ui.postMessage({
        type: "spec-created",
        spec: {
          id: specGroup.id,
          targetNodeId: node.id,
          name: node.name,
          letter: opts.letter,
          color: opts.color,
          fillColor: opts.fillColor || null,
          category: opts.category || "",
          type: opts.categoryLabel || "Sem categoria",
          note: opts.note,
          properties: opts.properties,
          excecoes: opts.excecaoInicial ? [opts.excecaoInicial] : [],
          guideSide: opts.guideSide || 'right',
          cardX: _absCardX,
          cardY: _absCardY,
          cardW: _absCardW,
          cardH: _absCardH,
          a11yType: opts.a11yType || null,
          a11ySubtype: opts.a11ySubtype || null,
          a11yOrigin: opts.a11yOrigin || 'web',
          a11ySourceLib: opts.a11ySourceLib || null,
          a11yDscComponentName: opts.a11yDscComponentName || null,
          a11yAreaId: opts.a11yAreaId || null,
          drawMode: opts.drawMode || 'contorno',
          needsReview: !!opts.needsReview,
        }
      });

      if (_markerImportFailReason) {
        // Card criado com sucesso (real ou procedural), mas o marcador visual
        // (contorno/conector) não pôde ser importado — ver fallback brando
        // acima. Nunca deixa a spec sumir por causa disso; só avisa que falta
        // revisar o destaque visual manualmente.
        figma.notify(`Especificação criada sem o marcador visual (contorno/conector) — não foi possível importá-lo (${_markerImportFailReason}). Revise o destaque manualmente.`, { error: true, timeout: 6000 });
      } else if (_isExpectedFallback) {
        figma.notify(`Especificação criada com card desenhado (sem componente real catalogado para esta variação: ${_a11yImportFailReason}). Arraste para posicionar.`);
      } else if (!opts.silent) {
        figma.notify("Especificação de acessibilidade criada.");
      }
    })();
    return;
  }

  if (msg.type === "lock-spec") {
    const specNode = await figma.getNodeByIdAsync(msg.specId);
    if (specNode && specNode.name && /^\[SpecA11y \| /.test(specNode.name)) {
      specNode.locked = true;
      figma.ui.postMessage({ type: "spec-locked", specId: msg.specId });
    }
    return;
  }

  if (msg.type === "unlock-spec-group") {
    const targetLocked = msg.locked !== undefined ? msg.locked : false;
    for (const specId of (msg.specIds || [])) {
      const specGroup = await figma.getNodeByIdAsync(specId);
      if (!specGroup) continue;
      specGroup.locked = targetLocked;
    }
