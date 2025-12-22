
import React from 'react';
import { MediaIcon, MusicIcon, TextIcon } from './icons';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'media', icon: <MediaIcon />, label: 'Media' },
    { id: 'audio', icon: <MusicIcon />, label: 'Audio' },
    { id: 'text', icon: <TextIcon />, label: 'Text' },
  ];

  return (
    <div className="
        fixed bottom-0 left-0 right-0 h-16 border-t border-gray-800 bg-[#161616] z-50 flex flex-row justify-around items-center px-2
        md:relative md:w-[72px] md:h-full md:flex-col md:justify-start md:border-r md:border-t-0 md:py-4 md:gap-6
    ">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`
            flex flex-col items-center justify-center rounded-lg transition-all duration-200 group relative
            w-full h-full md:w-12 md:h-12 md:rounded-xl
            ${activeTab === tab.id ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'}
          `}
        >
          {/* Active Indicator Desktop */}
          {activeTab === tab.id && (
              <div className="hidden md:block absolute -left-3 w-1 h-6 bg-purple-500 rounded-r-full"></div>
          )}
          {/* Active Indicator Mobile */}
          {activeTab === tab.id && (
              <div className="md:hidden absolute top-0 w-8 h-1 bg-purple-500 rounded-b-full shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
          )}

          <div className="w-6 h-6 mb-1 md:mb-0">{tab.icon}</div>
          <span className="text-[10px] font-medium md:hidden md:group-hover:block md:absolute md:left-14 md:bg-gray-800 md:px-2 md:py-1 md:rounded md:text-white md:z-50 md:shadow-lg">
              {tab.label}
          </span>
        </button>
      ))}
    </div>
  );
};

export default Sidebar;
