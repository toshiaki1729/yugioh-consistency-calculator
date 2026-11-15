import { useState } from 'react';
import { Button } from '../common/Button';
import { Dialog } from '../common/Dialog';
import { EFFECT_TEMPLATES } from './effectTemplates';
import type { EffectTemplate } from './effectTemplates';

/** 確認してから、選んだひな形で設定と手順を置き換える。 */
export function EffectTemplateButtons({ onApply }: {
  onApply: (template: EffectTemplate) => void;
}) {
  const [selected, setSelected] = useState<EffectTemplate | null>(null);
  function handleClose() { setSelected(null); }
  function handleApply() {
    if (!selected) return;
    onApply(selected);
    handleClose();
  }
  return <>
    <div className="EffectsView-actions EffectsView-templates" aria-label="手順のひな形">
      {EFFECT_TEMPLATES.map(template => <Button key={template.name}
        onClick={() => setSelected(template)}>{template.name}</Button>)}
    </div>
    <Dialog open={selected !== null} title="ひな形で置き換え" onClose={handleClose}>
      <p>現在の設定と手順を「{selected?.name}」のひな形で置き換えますか？</p>
      <div className="EffectsView-actions">
        <Button onClick={handleClose}>キャンセル</Button>
        <Button variant="primary" onClick={handleApply}>置き換える</Button>
      </div>
    </Dialog>
  </>;
}
