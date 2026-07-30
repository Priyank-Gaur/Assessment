import React from 'react';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import './WhatsAppButton.css';

const WHATSAPP_URL = 'https://wa.me/919136899581';

export const WhatsAppButton = () => {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="whatsapp-float-btn"
      aria-label="Chat with us on WhatsApp"
    >
      <WhatsAppIcon className="whatsapp-float-icon" />
      <span className="whatsapp-float-text">Chat with us</span>
    </a>
  );
};

export default WhatsAppButton;
