import React from 'react';
import { IconFolder, IconLogout } from './Icons';

interface SelectDirectoryViewProps {
  onSelect: () => void;
  userEmail: string;
  onLogout: () => void;
}

const SelectDirectoryView: React.FC<SelectDirectoryViewProps> = ({ onSelect, userEmail, onLogout }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4 text-center relative">
       <div className="absolute top-4 right-4 flex items-center gap-4">
        <span className="text-gray-400 text-sm">{userEmail}</span>
        <button onClick={onLogout} className="text-gray-400 hover:text-white" title="Sign Out">
            <IconLogout className="w-6 h-6" />
        </button>
      </div>
      <IconFolder className="w-24 h-24 text-indigo-400 mx-auto mb-6" />
      <h1 className="text-4xl font-bold text-white mb-4">Connect Your Study Folder</h1>
      <p className="text-lg text-gray-400 max-w-2xl mb-8">
        To read and display your PDFs for active highlighting, please select the local folder where your study materials are stored. Your files will not be uploaded.
      </p>
      <button 
        onClick={onSelect}
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-lg transition duration-300 text-lg"
      >
        Select Folder
      </button>
      <p className="text-sm text-gray-500 mt-6">
        Note: This app uses the File System Access API to access your files directly from your computer. <br/>You will need to grant permission for the selected folder.
      </p>
    </div>
  );
};

export default SelectDirectoryView;