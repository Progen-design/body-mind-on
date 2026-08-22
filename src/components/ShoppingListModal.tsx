import React, { useState } from 'react';
import { X, Check, Plus, ShoppingBag, Copy, CheckCheck, Trash2, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingItem } from '../types';

interface ShoppingListModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ShoppingItem[];
  onToggleItem: (id: string) => void;
  onAddItem: (item: ShoppingItem) => void;
  onDeleteItem?: (id: string) => void;
}

export const ShoppingListModal: React.FC<ShoppingListModalProps> = ({
  isOpen,
  onClose,
  items,
  onToggleItem,
  onAddItem,
  onDeleteItem
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Vše');
  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<ShoppingItem['category']>('Maso & Ryby');
  const [isCopied, setIsCopied] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  if (!isOpen) return null;

  const categories = ['Vše', 'Maso & Ryby', 'Mléčné výrobky & Vejce', 'Přílohy & Pečivo', 'Zelenina & Ovoce', 'Ořechy, Tuky & Ostatní'];

  const filteredItems = selectedCategory === 'Vše'
    ? items
    : items.filter(it => it.category === selectedCategory);

  const completedCount = items.filter(i => i.checked).length;

  const handleCopyList = () => {
    const text = items
      .map(i => `${i.checked ? '[x]' : '[ ]'} ${i.name} - ${i.amount} (${i.category})`)
      .join('\n');
    navigator.clipboard.writeText(`Nákupní seznam Body & Mind ON:\n\n${text}`);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleAddNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    onAddItem({
      id: `shop-${Date.now()}`,
      name: newItemName.trim(),
      amount: newItemAmount.trim() || '1 balení',
      category: newItemCategory,
      checked: false
    });

    setNewItemName('');
    setNewItemAmount('');
    setShowAddForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Modal Container */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative z-10 w-full max-w-2xl max-h-[90vh] bg-[#0c1017] rounded-3xl border border-cyan-500/40 shadow-[0_0_50px_rgba(0,242,254,0.2)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-[#0e1624] to-[#0c1017]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-[#00f2fe]">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Týdenní nákupní seznam
              </h3>
              <p className="text-xs text-slate-400">
                Splněno {completedCount} z {items.length} položek • Automaticky vypočteno z jídelníčku
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyList}
              className="p-2 rounded-xl text-slate-300 hover:text-white bg-slate-900 border border-slate-800 flex items-center gap-1.5 text-xs font-semibold"
              title="Zkopírovat seznam do schránky"
            >
              {isCopied ? <CheckCheck className="w-4 h-4 text-[#39ff14]" /> : <Copy className="w-4 h-4 text-cyan-400" />}
              <span className="hidden sm:inline">{isCopied ? 'Zkopírováno' : 'Kopírovat'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Categories Bar */}
        <div className="p-3 bg-slate-900/60 border-b border-slate-800/80 overflow-x-auto no-scrollbar flex items-center gap-1.5">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-cyan-950 text-[#00f2fe] border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-900/40 border border-transparent'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* List of items */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-2.5 flex-1">
          {filteredItems.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs">
              Žádné položky v této kategorii.
            </div>
          ) : (
            filteredItems.map(item => (
              <div
                key={item.id}
                onClick={() => onToggleItem(item.id)}
                className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                  item.checked
                    ? 'bg-slate-900/40 border-slate-800/60 opacity-60'
                    : 'bg-[#0e131d]/90 border-slate-800 hover:border-cyan-500/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                      item.checked
                        ? 'bg-[#39ff14] border-[#39ff14] text-slate-950 shadow-[0_0_8px_#39ff14]'
                        : 'border-slate-700 bg-slate-900'
                    }`}
                  >
                    {item.checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>

                  <div>
                    <span className={`text-xs sm:text-sm font-semibold block ${item.checked ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                      {item.name}
                    </span>
                    <span className="text-[10px] text-cyan-400/80 font-medium">
                      {item.category}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                    {item.amount}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add custom item section */}
        {showAddForm ? (
          <form onSubmit={handleAddNew} className="p-4 bg-slate-900/90 border-t border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                placeholder="Název suroviny (např. Tvaroh)"
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                autoFocus
              />
              <input
                type="text"
                value={newItemAmount}
                onChange={e => setNewItemAmount(e.target.value)}
                placeholder="Množství (např. 500g)"
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
              <select
                value={newItemCategory}
                onChange={e => setNewItemCategory(e.target.value as ShoppingItem['category'])}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="Maso & Ryby">Maso & Ryby</option>
                <option value="Mléčné výrobky & Vejce">Mléčné výrobky & Vejce</option>
                <option value="Přílohy & Pečivo">Přílohy & Pečivo</option>
                <option value="Zelenina & Ovoce">Zelenina & Ovoce</option>
                <option value="Ořechy, Tuky & Ostatní">Ořechy, Tuky & Ostatní</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Zrušit
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#00f2fe] text-slate-950 hover:bg-[#00f2fe]/90"
              >
                Přidat položku
              </button>
            </div>
          </form>
        ) : (
          <div className="p-4 bg-slate-900/40 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-cyan-300"
            >
              <Plus className="w-4 h-4" />
              <span>Přidat vlastní položku</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700"
            >
              Zavřít
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
