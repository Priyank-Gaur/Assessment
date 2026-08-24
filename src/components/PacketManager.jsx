import React, { useState, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import './PacketManager.css';

const PacketManager = ({ packets: rawPackets, addPacket, updatePacket, deletePacket, addQuestion, updateQuestion, deleteQuestion, onDataChange }) => {
  const configureAreaRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');

  const packets = useMemo(() => {
    return (rawPackets || []).map(packet => {
      let scale = packet.scoringScale;
      if (typeof scale === 'string') {
        try {
          scale = JSON.parse(scale);
        } catch (e) {
          console.error('Failed to parse packet scoringScale:', e);
          scale = [];
        }
      }
      return {
        ...packet,
        scoringScale: Array.isArray(scale) ? scale : [],
        questions: (packet.questions || []).map(q => {
          let opts = q.options;
          if (typeof opts === 'string') {
            try {
              opts = JSON.parse(opts);
            } catch (e) {
              console.error('Failed to parse question options:', e);
              opts = [];
            }
          }
          return {
            ...q,
            options: Array.isArray(opts) ? opts : []
          };
        })
      };
    });
  }, [rawPackets]);

  const filteredPackets = useMemo(() => {
    if (!searchQuery.trim()) return packets;
    const query = searchQuery.toLowerCase().trim();
    return packets.filter(p => 
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.description && p.description.toLowerCase().includes(query))
    );
  }, [packets, searchQuery]);

  const handleSelectPacket = (packetId) => {
    setSelectedPacket(packetId);
    setTimeout(() => {
      if (configureAreaRef.current) {
        configureAreaRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const [packetName, setPacketName] = useState('');
  const [packetDescription, setPacketDescription] = useState('');
  const [scoringLogic, setScoringLogic] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [questionType, setQuestionType] = useState('MCQ');
  const [options, setOptions] = useState([
    { text: '', marks: 0 }
  ]);
  const [selectedPacket, setSelectedPacket] = useState(null);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [editQuestionText, setEditQuestionText] = useState('');
  const [editQuestionType, setEditQuestionType] = useState('MCQ');
  const [editOptions, setEditOptions] = useState([
    { text: '', marks: 0 }
  ]);
  const [editingPacket, setEditingPacket] = useState(null);
  const [editPacketName, setEditPacketName] = useState('');
  const [editPacketDescription, setEditPacketDescription] = useState('');
  const [editScoringLogic, setEditScoringLogic] = useState('');

  // Scoring Scale System State
  const [scoringScaleDialog, setScoringScaleDialog] = useState(false);
  const [scoringScale, setScoringScale] = useState([
    { min: 0, max: 2, label: "Needs Improvement", color: "#ff6b6b", image: "📚", largeText: "Keep practicing! You're making progress." },
    { min: 3, max: 5, label: "Average", color: "#FCCB00", image: "📊", largeText: "Good effort! You're on the right track." },
    { min: 6, max: 8, label: "Good", color: "#6bcf7f", image: "🎯", largeText: "Well done! You're showing strong understanding." },
    { min: 9, max: 15, label: "Excellent", color: "#4ecdc4", image: "🏆", largeText: "Outstanding! You've mastered this material!" }
  ]);
  const [enableScoringScale, setEnableScoringScale] = useState(false);

  // Handle question type change
  const handleQuestionTypeChange = (newType) => {
    setQuestionType(newType);
    if (newType === 'MCQ') {
      setOptions([{ text: '', marks: 0 }]);
    } else {
      // For True/False, preserve existing marks if they exist, otherwise use defaults
      if (options.length === 2 && options[0].text === 'True' && options[1].text === 'False') {
        // Keep existing marks if already True/False
        setOptions(options);
      } else {
        // Set default marks for new True/False questions
        setOptions([
          { text: 'True', marks: 3 },
          { text: 'False', marks: 2 }
        ]);
      }
    }
  };

  // Handle edit question type change
  const handleEditQuestionTypeChange = (newType) => {
    console.log('🔍 handleEditQuestionTypeChange called with:', newType);
    console.log('🔍 Current editOptions before change:', editOptions);
    console.log('🔍 Current editQuestionType:', editQuestionType);
    
    // Only change if the type is actually different
    if (newType === editQuestionType) {
      console.log('🔍 Question type unchanged, preserving current options');
      return;
    }
    
    setEditQuestionType(newType);
    if (newType === 'MCQ') {
      setEditOptions([{ text: '', marks: 0 }]);
    } else {
      // For True/False, preserve existing marks if they exist, otherwise use defaults
      if (editOptions.length === 2 && editOptions[0].text === 'True' && editOptions[1].text === 'False') {
        // Keep existing marks if already True/False
        console.log('🔍 Preserving existing True/False marks:', editOptions);
        setEditOptions(editOptions);
      } else {
        // Set default marks for new True/False questions
        console.log('🔍 Setting default True/False marks');
        setEditOptions([
          { text: 'True', marks: 3 },
          { text: 'False', marks: 2 }
        ]);
      }
    }
    console.log('🔍 Final editOptions after change:', editOptions);
  };

  // Add new option for MCQ
  const addOption = () => {
    setOptions([...options, { text: '', marks: 0 }]);
  };

  // Add new option for edit MCQ
  const addEditOption = () => {
    setEditOptions([...editOptions, { text: '', marks: 0 }]);
  };

  // Remove option for MCQ
  const removeOption = (index) => {
    if (options.length > 1) {
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
    }
  };

  // Remove option for edit MCQ
  const removeEditOption = (index) => {
    if (editOptions.length > 1) {
      const newOptions = editOptions.filter((_, i) => i !== index);
      setEditOptions(newOptions);
    }
  };

  // Update option text
  const updateOptionText = (index, text) => {
    const newOptions = [...options];
    newOptions[index].text = text;
    setOptions(newOptions);
  };

  // Update edit option text
  const updateEditOptionText = (index, text) => {
    const newOptions = [...editOptions];
    newOptions[index].text = text;
    setEditOptions(newOptions);
  };

  // Update option marks
  const updateOptionMarks = (index, marks) => {
    const newOptions = [...options];
    const parsedMarks = parseInt(marks);
    const finalMarks = isNaN(parsedMarks) ? 0 : parsedMarks;
    console.log(`🔍 updateOptionMarks: index=${index}, input=${marks}, parsed=${parsedMarks}, final=${finalMarks}`);
    newOptions[index].marks = finalMarks;
    setOptions(newOptions);
    console.log(`🔍 Updated options:`, newOptions);
  };

  // Update edit option marks
  const updateEditOptionMarks = (index, marks) => {
    const newOptions = [...editOptions];
    const parsedMarks = parseInt(marks);
    const finalMarks = isNaN(parsedMarks) ? 0 : parsedMarks;
    console.log(`🔍 updateEditOptionMarks: index=${index}, input=${marks}, parsed=${parsedMarks}, final=${finalMarks}`);
    console.log(`🔍 Before update - option ${index}:`, newOptions[index]);
    newOptions[index].marks = finalMarks;
    console.log(`🔍 After update - option ${index}:`, newOptions[index]);
    
    // Update the state
    setEditOptions(newOptions);
    console.log(`🔍 Updated edit options:`, newOptions);
    
    // Store the updated options in a ref to ensure we have the latest values
    window.lastEditOptions = newOptions;
    
    // Force a re-render to ensure state is updated
    setTimeout(() => {
      console.log(`🔍 State after timeout - editOptions:`, editOptions);
      console.log(`🔍 Window stored options:`, window.lastEditOptions);
    }, 100);
  };

  // Image upload handler for scoring scale
  const handleImageUpload = (index, event) => {
    const file = event.target.files[0];
    if (file) {
      console.log(`🖼️ Uploading image for range ${index}:`, file.name, file.type, file.size);
      
      // Check if file is PNG or JPEG
      if (file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const imageData = e.target.result;
          console.log(`✅ Image ${index} converted to base64, length:`, imageData.length);
          updateScoringScaleRange(index, 'image', imageData);
        };
        reader.readAsDataURL(file);
      } else {
        alert('Please upload only PNG or JPEG images.');
      }
    }
  };

  // Scoring Scale System Functions
  const openScoringScaleDialog = () => {
    console.log('Opening scoring scale dialog...');
    console.log('Selected packet:', selectedPacket);
    console.log('Current packet marks:', currentPacketMarks);
    
    if (selectedPacket && currentPacketMarks) {
      // Check if we already have saved scoring scale data for this packet
      const packet = packets.find(p => p.id === selectedPacket);
      
      if (packet && packet.scoringScale && packet.scoringScale.length > 0) {
        // Use existing saved data
        console.log('✅ Loading existing scoring scale data:', packet.scoringScale);
        setScoringScale(packet.scoringScale);
        setEnableScoringScale(packet.enableScoringScale || false);
      } else {
        // Auto-generate ranges only if no existing data
        const minMarks = currentPacketMarks.minMarks;
        const maxMarks = currentPacketMarks.maxMarks;
        const range = maxMarks - minMarks;
        
        console.log('Min marks:', minMarks, 'Max marks:', maxMarks, 'Range:', range);
        
        // Check if packet uses decimal marks
        const isDecimal = minMarks % 1 !== 0 || maxMarks % 1 !== 0;
        
        // Default to 4 ranges, but can be modified by user
        const numRanges = 4;
        const step = range / numRanges;
        
        const newScale = Array.from({ length: numRanges }, (_, i) => {
          const isLast = i === numRanges - 1;
          // Use parseFloat and toFixed for decimal precision
          const calculatedMin = i === 0 ? minMarks : parseFloat((minMarks + step * i + 0.1).toFixed(2));
          const calculatedMax = isLast ? maxMarks : parseFloat((minMarks + step * (i + 1)).toFixed(2));
          
          return {
            min: calculatedMin,
            max: calculatedMax,
            label: i === 0 ? "Needs Improvement" : 
                   i === 1 ? "Average" : 
                   i === 2 ? "Good" : "Excellent",
            color: i === 0 ? "#ff6b6b" : 
                   i === 1 ? "#FCCB00" : 
                   i === 2 ? "#6bcf7f" : "#4ecdc4",
            image: i === 0 ? "📚" : 
                   i === 1 ? "📊" : 
                   i === 2 ? "🎯" : "🏆",
            largeText: i === 0 ? "Keep practicing! You're making progress." :
                       i === 1 ? "Good effort! You're on the right track." :
                       i === 2 ? "Well done! You're showing strong understanding." :
                       "Outstanding! You've mastered this material!"
          };
        });
        
        console.log('🎯 Auto-generated scale ranges:', newScale.map(s => `${s.min}-${s.max}`));
        console.log('New scale:', newScale);
        setScoringScale(newScale);
        setEnableScoringScale(false);
      }
    }
    setScoringScaleDialog(true);
  };

  const closeScoringScaleDialog = () => {
    setScoringScaleDialog(false);
  };

  // Add a new range to the scoring scale
  const addScoringRange = () => {
    const lastRange = scoringScale[scoringScale.length - 1];
    // Support decimal increments - use 0.5 or 1 as step based on packet marks
    const isDecimal = currentPacketMarks?.maxMarks % 1 !== 0 || currentPacketMarks?.minMarks % 1 !== 0;
    const step = isDecimal ? 0.5 : 2;
    
    const newMin = lastRange ? parseFloat((lastRange.max + 0.1).toFixed(2)) : 0;
    const newMax = lastRange ? Math.min(parseFloat((newMin + step).toFixed(2)), currentPacketMarks?.maxMarks || newMin + step) : (isDecimal ? 0.5 : 2);
    
    const newRange = {
      min: newMin,
      max: newMax,
      label: `Level ${scoringScale.length + 1}`,
      color: `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`,
      image: "⭐",
      largeText: `Great job at level ${scoringScale.length + 1}!`
    };
    
    setScoringScale([...scoringScale, newRange]);
  };

  // Remove a range from the scoring scale
  const removeScoringRange = (indexToRemove) => {
    if (scoringScale.length <= 2) {
      alert('You must have at least 2 performance levels.');
      return;
    }
    
    const newScale = scoringScale.filter((_, index) => index !== indexToRemove);
    
    // Rebalance the ranges after removal - support decimals
    const rebalancedScale = newScale.map((range, index) => {
      if (index === 0) {
        return { ...range, min: currentPacketMarks?.minMarks || 0 };
      } else {
        // Use small increment for decimals to avoid gaps
        const prevMax = newScale[index - 1].max;
        const newMin = parseFloat((prevMax + 0.1).toFixed(2));
        return { ...range, min: newMin };
      }
    });
    
    // Ensure the last range ends at maxMarks
    if (rebalancedScale.length > 0) {
      const lastIndex = rebalancedScale.length - 1;
      rebalancedScale[lastIndex] = {
        ...rebalancedScale[lastIndex],
        max: currentPacketMarks?.maxMarks || rebalancedScale[lastIndex].max
      };
    }
    
    setScoringScale(rebalancedScale);
  };

  const updateScoringScaleRange = (index, field, value) => {
    console.log(`🔄 Updating scoring scale range ${index}, field: ${field}, value:`, value);
    console.log('📊 Current scoring scale before update:', scoringScale);
    
    const newScale = [...scoringScale];
    // Use parseFloat instead of parseInt to support decimal ranges
    newScale[index][field] = field === 'min' || field === 'max' ? parseFloat(value) || 0 : value;
    
    console.log('📊 New scoring scale after update:', newScale);
    setScoringScale(newScale);
  };

  const getScoreLevel = (score) => {
    if (!enableScoringScale || !scoringScale.length) return null;
    
    const level = scoringScale.find(range => score >= range.min && score <= range.max);
    return level || null;
  };

  const saveScoringScale = async () => {
    // Validate ranges - only check that min <= max for each range
    let isValid = true;
    for (let i = 0; i < scoringScale.length; i++) {
      if (scoringScale[i].min > scoringScale[i].max) {
        isValid = false;
        break;
      }
      // Remove the strict connection requirement - allow gaps between ranges
    }
    
    if (isValid) {
      setEnableScoringScale(true);
      
      // Save scoring scale to the selected packet data
      if (selectedPacket) {
        try {
          console.log('🚀 Attempting to save scoring scale for packet:', selectedPacket);
          console.log('📊 Scoring scale data to save:', scoringScale);
          console.log('📊 Scoring scale length:', scoringScale.length);
          console.log('📊 Each range details:');
          scoringScale.forEach((range, idx) => {
            console.log(`  Range ${idx}: min=${range.min}, max=${range.max}, hasImage=${!!range.image}, imageLength=${range.image?.length || 0}`);
          });
          
          // Update the packet with scoring scale data
          const currentPacket = packets.find(p => p.id === selectedPacket);
          const packetToUpdate = {
            name: currentPacket?.name || '',
            description: currentPacket?.description || '',
            scoringScale: scoringScale,
            enableScoringScale: true
          };
          
          console.log('📤 Sending update request with data:', packetToUpdate);
          
          // Validate the data structure before sending
          const isValidData = packetToUpdate.scoringScale.every((range, idx) => {
            const isValid = range && 
                          typeof range.min === 'number' && 
                          typeof range.max === 'number' && 
                          range.min <= range.max &&
                          typeof range.label === 'string' &&
                          typeof range.color === 'string';
            
            if (!isValid) {
              console.error(`❌ Invalid range data at index ${idx}:`, range);
            }
            return isValid;
          });
          
          if (!isValidData) {
            throw new Error('Invalid scoring scale data structure detected');
          }
          
          // Update the packet in the database
          const result = await updatePacket(selectedPacket, packetToUpdate);
          console.log('✅ Scoring scale saved successfully. Server response:', result);
          
          // Refresh the packets list to show updated data
          if (onDataChange) {
            await onDataChange();
          }
        } catch (err) {
          console.error('❌ Failed to save scoring scale to packet:', err);
          console.error('❌ Error details:', err.message, err.stack);
          alert('Failed to save scoring scale. Please try again.');
        }
      } else {
        console.error('❌ No packet selected for saving scoring scale');
        alert('Please select a packet first.');
      }
      
      closeScoringScaleDialog();
    } else {
      alert('Please fix the scoring ranges. Each range must have min <= max.');
    }
  };

  // Set correct answer
  const setCorrectAnswerOption = (optionText) => {
    // This function is no longer needed as correct answer is not tracked per question
  };

  // Set edit correct answer
  const setEditCorrectAnswerOption = (optionText) => {
    // This function is no longer needed as correct answer is not tracked per question
  };

  // Calculate min and max marks for a packet
  const calculatePacketMarks = (packetId) => {
    const packet = packets.find(p => p.id === packetId);
    if (!packet || !packet.questions || packet.questions.length === 0) {
      return { minMarks: 0, maxMarks: 0, totalQuestions: 0 };
    }

    let totalMinMarks = 0;
    let totalMaxMarks = 0;
    let totalQuestions = packet.questions.length;

    packet.questions.forEach(question => {
      if (question.options && Array.isArray(question.options)) {
        // For questions with options, calculate based on individual option marks
        if (typeof question.options[0] === 'object') {
          // New format with individual option marks
          const optionMarks = question.options.map(opt => opt.marks || 1);
          const questionMin = Math.min(...optionMarks); // Worst possible answer
          const questionMax = Math.max(...optionMarks); // Best possible answer
          totalMinMarks += questionMin;
          totalMaxMarks += questionMax;
        } else {
          // Old format - use question marks (fallback)
          totalMinMarks += question.marks || 1;
          totalMaxMarks += question.marks || 1;
        }
      } else {
        // Fallback for questions without options
        totalMinMarks += question.marks || 1;
        totalMaxMarks += question.marks || 1;
      }
    });

    return {
      minMarks: totalMinMarks, // Total marks if student chooses worst answer for every question
      maxMarks: totalMaxMarks, // Total marks if student chooses best answer for every question
      totalQuestions
    };
  };

  // Get current packet marks info
  const currentPacketMarks = selectedPacket ? calculatePacketMarks(selectedPacket) : { minMarks: 0, maxMarks: 0, totalQuestions: 0 };

  // Load scoring scale from packet data when packet is selected
  useEffect(() => {
    if (selectedPacket) {
      const packet = packets.find(p => p.id === selectedPacket);
      console.log('🔍 Loading scoring scale for packet:', selectedPacket);
      console.log('📦 Found packet:', packet);
      console.log('📊 Packet scoring scale:', packet?.scoringScale);
      
      if (packet && packet.scoringScale) {
        setScoringScale(packet.scoringScale);
        setEnableScoringScale(packet.enableScoringScale || false);
        console.log('✅ Loaded scoring scale from packet data:', packet.scoringScale);
        console.log('🖼️ First range image:', packet.scoringScale[0]?.image);
      } else {
        // Reset to default scale if no custom scale found
        setScoringScale([
          { min: 0, max: 2, label: "Needs Improvement", color: "#ff6b6b", image: "📚", largeText: "Keep practicing! You're making progress." },
          { min: 3, max: 5, label: "Average", color: "#FCCB00", image: "📊", largeText: "Good effort! You're on the right track." },
          { min: 6, max: 8, label: "Good", color: "#6bcf7f", image: "🎯", largeText: "Well done! You're showing strong understanding." },
          { min: 9, max: 15, label: "Excellent", color: "#4ecdc4", image: "🏆", largeText: "Outstanding! You've mastered this material!" }
        ]);
        setEnableScoringScale(false);
        console.log('🔄 Reset to default scoring scale');
      }

      // Auto-fill options from the last question in the selected packet if available
      if (packet && packet.questions && packet.questions.length > 0) {
        const lastQ = packet.questions[packet.questions.length - 1];
        if (lastQ && lastQ.options && Array.isArray(lastQ.options) && lastQ.options.length > 0) {
          const formattedOptions = lastQ.options.map(opt => {
            if (typeof opt === 'string') {
              return { text: opt, marks: lastQ.marks || 0 };
            }
            return { text: opt.text || '', marks: typeof opt.marks === 'number' ? opt.marks : 0 };
          });
          setOptions(formattedOptions);
          const type = (lastQ.question_type === 'true_false' || lastQ.type === 'true_false') ? 'TrueFalse' : 'MCQ';
          setQuestionType(type);
        }
      }
    }
  }, [selectedPacket, packets]);

  // Recalculate marks when options change during editing
  useEffect(() => {
    if (editingQuestionId && selectedPacket) {
      // Force re-render to update marks calculation when editing
      setSelectedPacket(selectedPacket);
    }
  }, [editOptions, editingQuestionId, selectedPacket]);





  const handleAddPacket = async () => {
    if (packetName) {
      try {
        await addPacket({ 
          name: packetName, 
          description: packetDescription,
          scoringLogic: scoringLogic
        });
        setPacketName('');
        setPacketDescription('');
        setScoringLogic('');
      } catch (error) {
        console.error('Error adding packet:', error);
        alert('Failed to add packet. Please try again.');
      }
    }
  };

  const startEditPacket = (packet) => {
    setEditingPacket(packet.id);
    setEditPacketName(packet.name);
    setEditPacketDescription(packet.description || '');
    setEditScoringLogic(packet.scoringLogic || '');
  };

  const saveEditPacket = async () => {
    if (editPacketName && editingPacket) {
      try {
        await updatePacket(editingPacket, {
          name: editPacketName,
          description: editPacketDescription,
          scoringLogic: editScoringLogic
        });
        setEditingPacket(null);
        setEditPacketName('');
        setEditPacketDescription('');
        setEditScoringLogic('');
      } catch (error) {
        console.error('Error updating packet:', error);
        alert('Failed to update packet. Please try again.');
      }
    }
  };

  const cancelEditPacket = () => {
    setEditingPacket(null);
    setEditPacketName('');
    setEditPacketDescription('');
    setEditScoringLogic('');
  };

  const handleDeletePacket = async (id) => {
    if (window.confirm('Are you sure you want to delete this packet?')) {
      try {
        await deletePacket(id);
        if (selectedPacket === id) setSelectedPacket(null);
      } catch (error) {
        console.error('Error deleting packet:', error);
        alert('Failed to delete packet. Please try again.');
      }
    }
  };

  const handleAddQuestion = async () => {
    if (!questionText || !selectedPacket) return;
    
    try {
      const questionData = {
        packet_id: selectedPacket,
        question_text: questionText,
        question_type: questionType === 'MCQ' ? 'mcq' : 'true_false',
        options: options,
        marks: options.reduce((sum, opt) => sum + opt.marks, 0) // Total marks for the question
      };
      
      console.log('🚀 Frontend sending question data:', questionData);
      console.log('🔍 Options being sent:', options);
      console.log('🔍 Question type:', questionType);
      console.log('🔍 Options structure check:');
      console.log('  - Options is array:', Array.isArray(options));
      console.log('  - Options length:', options.length);
      console.log('  - First option:', options[0]);
      console.log('  - First option has text:', options[0]?.hasOwnProperty('text'));
      console.log('  - First option has marks:', options[0]?.hasOwnProperty('marks'));
      console.log('  - First option text:', options[0]?.text);
      console.log('  - First option marks:', options[0]?.marks);
      
      await addQuestion(questionData);
      setQuestionText('');
      // Auto-fill options and scores from the added question for the next question
      if (options && options.length > 0) {
        setOptions(options.map(opt => ({ text: opt.text || '', marks: typeof opt.marks === 'number' ? opt.marks : 0 })));
      } else {
        setOptions([{ text: '', marks: 0 }]);
      }
      
      // Force re-render to update marks calculation
      setSelectedPacket(selectedPacket);
    } catch (error) {
      console.error('Error adding question:', error);
      alert('Failed to add question. Please try again.');
    }
  };

  const handleDeleteQuestion = async (qid) => {
    if (window.confirm("Are you sure you want to delete this question?")) {
      try {
        await deleteQuestion(qid);
        
        // Force re-render to update marks calculation
        setSelectedPacket(selectedPacket);
      } catch (error) {
        console.error('Error deleting question:', error);
        alert('Failed to delete question. Please try again.');
      }
    }
  };

  const startEditQuestion = (q) => {
    console.log('🔍 startEditQuestion - Starting edit for question:', q.id);
    console.log('🔍 startEditQuestion - Question data:', q);
    console.log('🔍 startEditQuestion - Question options:', q.options);
    console.log('🔍 startEditQuestion - Question marks:', q.marks);
    console.log('🔍 startEditQuestion - Question type:', q.question_type);
    
    setEditingQuestionId(q.id);
    setEditQuestionText(q.question_text || q.text);
    setEditQuestionType(q.question_type === 'mcq' ? 'MCQ' : 'TrueFalse');
    
    if (q.question_type === 'mcq' && q.options) {
      // Convert options to new format if they're in old format
      if (Array.isArray(q.options) && typeof q.options[0] === 'string') {
        console.log('🔍 Converting MCQ options from old format');
        setEditOptions(q.options.map((opt, idx) => ({
          text: opt,
          marks: q.marks || 0
        })));
      } else {
        console.log('🔍 Using MCQ options as-is');
        setEditOptions(q.options || [{ text: '', marks: 0 }]);
      }
    } else if (q.question_type === 'true_false') {
      // For True/False questions, check if they have individual marks
      if (q.options && Array.isArray(q.options) && q.options.length === 2) {
        // Check if options have individual marks
        const hasIndividualMarks = q.options[0]?.hasOwnProperty('marks') && q.options[1]?.hasOwnProperty('marks');
        
        console.log('🔍 True/False options found:', q.options);
        console.log('🔍 Has individual marks:', hasIndividualMarks);
        console.log('🔍 Option 0:', q.options[0]);
        console.log('🔍 Option 1:', q.options[1]);
        
        if (hasIndividualMarks) {
          // Use existing individual marks
          console.log('🔍 Using existing individual marks:', q.options[0]?.marks, q.options[1]?.marks);
          const newOptions = [
            { text: 'True', marks: q.options[0].marks },
            { text: 'False', marks: q.options[1].marks }
          ];
          console.log('🔍 Setting editOptions to:', newOptions);
          setEditOptions(newOptions);
          
          // Also store in window for debugging
          window.lastEditOptions = newOptions;
        } else {
          // Convert from old format (total marks) to individual marks
          console.log('🔍 Converting from total marks to individual marks');
          const totalMarks = q.marks || 2;
          const trueMarks = Math.ceil(totalMarks * 0.6); // 60% for True
          const falseMarks = totalMarks - trueMarks; // Remaining for False
          
          const newOptions = [
            { text: 'True', marks: trueMarks },
            { text: 'False', marks: falseMarks }
          ];
          console.log('🔍 Setting editOptions to:', newOptions);
          setEditOptions(newOptions);
          
          // Also store in window for debugging
          window.lastEditOptions = newOptions;
        }
      } else {
        // Default marks for new True/False questions
        console.log('🔍 Using default marks for new True/False question');
        const newOptions = [
          { text: 'True', marks: 3 },
          { text: 'False', marks: 2 }
        ];
        console.log('🔍 Setting editOptions to:', newOptions);
        setEditOptions(newOptions);
        
        // Also store in window for debugging
        window.lastEditOptions = newOptions;
      }
    }
    
    console.log('🔍 startEditQuestion - Final editOptions set to:', editOptions);
  };

  const saveEditQuestion = async (qid) => {
    try {
      // Log the current state right before creating updates
      console.log('🔍 saveEditQuestion - Current editOptions state:', editOptions);
      console.log('🔍 saveEditQuestion - Current editQuestionText:', editQuestionText);
      console.log('🔍 saveEditQuestion - Current editQuestionType:', editQuestionType);
      console.log('🔍 saveEditQuestion - Window stored options:', window.lastEditOptions);
      
      // Use the stored options if there's a state mismatch
      const optionsToUse = window.lastEditOptions && window.lastEditOptions.length > 0 ? window.lastEditOptions : editOptions;
      console.log('🔍 saveEditQuestion - Options to use for save:', optionsToUse);
      
      const updates = {
        question_text: editQuestionText,
        question_type: editQuestionType === 'MCQ' ? 'mcq' : 'true_false',
        options: optionsToUse,
        marks: optionsToUse.reduce((sum, opt) => sum + opt.marks, 0) // Total marks for the question
      };
      
      console.log('🚀 Frontend sending edit data:', updates);
      console.log('🔍 Edit options being sent:', editOptions);
      console.log('🔍 Edit question type:', editQuestionType);
      console.log('🔍 Edit options structure check:');
      console.log('  - Edit options is array:', Array.isArray(editOptions));
      console.log('  - Edit options length:', editOptions.length);
      console.log('  - First edit option:', editOptions[0]);
      console.log('  - First edit option has text:', editOptions[0]?.hasOwnProperty('text'));
      console.log('  - First edit option has marks:', editOptions[0]?.hasOwnProperty('marks'));
      console.log('  - First edit option text:', editOptions[0]?.text);
      console.log('  - First edit option marks:', editOptions[0]?.marks);
      console.log('  - Second edit option text:', editOptions[1]?.text);
      console.log('  - Second edit option marks:', editOptions[1]?.marks);
      
      await updateQuestion(qid, updates);
      setEditingQuestionId(null);
      setEditQuestionText('');
      setEditOptions([{ text: '', marks: 0 }]);
      
      // Force re-render to update marks calculation
      setSelectedPacket(selectedPacket);
    } catch (error) {
      console.error('Error updating question:', error);
      alert('Failed to update question. Please try again.');
    }
  };

  return (
    <div className="packet-manager">
      <div className="packet-manager__grid">
        {/* Left column / Sidebar */}
        <div className="packet-manager__sidebar">
          {/* New Packet Form */}
          <div className="section-card">
            <h3 className="section-card__title">New Packet</h3>
            <div className="form-group">
              <label className="form-label">Packet Name</label>
              <input
                type="text"
                className="form-input"
                value={packetName}
                onChange={e => setPacketName(e.target.value)}
                placeholder="Enter packet name..."
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-input"
                value={packetDescription}
                onChange={e => setPacketDescription(e.target.value)}
                rows={2}
                placeholder="Enter packet description..."
              />
            </div>
            <div className="form-group">
              <label className="form-label">Scoring Logic</label>
              <textarea
                className="form-input"
                value={scoringLogic}
                onChange={e => setScoringLogic(e.target.value)}
                rows={3}
                placeholder="Enter scoring logic for this packet..."
              />
              <span className="form-helper">Describe how this packet should be scored</span>
            </div>
            <button className="btn btn--primary btn--full" onClick={handleAddPacket}>
              <AddCircleOutlineIcon className="btn-icon" />
              Add Packet
            </button>
          </div>

          {/* Packets List */}
          <div className="section-card" style={{ marginTop: 'var(--space-6)' }}>
            <h3 className="section-card__title">Packets</h3>

            {/* Search Bar */}
            <div className="search-bar-container" style={{ marginBottom: 'var(--space-4)' }}>
              <input
                type="text"
                className="form-input search-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search packets..."
                style={{
                  paddingLeft: '36px',
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23895BF5\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z\'/%3E%3C/svg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: '10px center',
                  backgroundSize: '18px 18px'
                }}
              />
            </div>

            {/* Overall Statistics */}
            {filteredPackets.length > 0 && (
              <div className="packet-stats-summary">
                <h4 className="packet-stats-summary__title">
                  📈 Overall Quiz Statistics
                </h4>
                <div className="packet-stats-summary__grid">
                  <div className="packet-stats-summary__item">
                    <span>Total Packets:</span> <strong>{filteredPackets.length}</strong>
                  </div>
                  <div className="packet-stats-summary__item">
                    <span>Total Questions:</span> <strong>{filteredPackets.reduce((total, packet) => total + (packet.questions?.length || 0), 0)}</strong>
                  </div>
                  <div className="packet-stats-summary__item">
                    <span>Min Marks:</span> <strong>
                      {(() => {
                        const allMarks = filteredPackets.map(p => calculatePacketMarks(p.id)).filter(m => m.minMarks > 0);
                        if (allMarks.length === 0) return 0;
                        return Math.min(...allMarks.map(m => m.minMarks));
                      })()}
                    </strong>
                  </div>
                  <div className="packet-stats-summary__item">
                    <span>Max Marks:</span> <strong>
                      {(() => {
                        const allMarks = filteredPackets.map(p => calculatePacketMarks(p.id)).filter(m => m.maxMarks > 0);
                        if (allMarks.length === 0) return 0;
                        return Math.max(...allMarks.map(m => m.maxMarks));
                      })()}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <div className="packet-list">
              {filteredPackets.map((packet) => {
                const isSelected = selectedPacket === packet.id && editingPacket !== packet.id;
                const isEditingThis = editingPacket === packet.id;

                return (
                  <div 
                    key={packet.id}
                    className={`packet-list-item ${isSelected ? 'packet-list-item--selected' : ''} ${isEditingThis ? 'packet-list-item--editing' : ''}`}
                    onClick={() => !isEditingThis && handleSelectPacket(packet.id)}
                  >
                    {isEditingThis ? (
                      <div className="packet-edit-form" onClick={e => e.stopPropagation()}>
                        <div className="form-group">
                          <label className="form-label">Packet Name</label>
                          <input
                            type="text"
                            className="form-input"
                            value={editPacketName}
                            onChange={e => setEditPacketName(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Description</label>
                          <textarea
                            className="form-input"
                            value={editPacketDescription}
                            onChange={e => setEditPacketDescription(e.target.value)}
                            rows={2}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Scoring Logic</label>
                          <textarea
                            className="form-input"
                            value={editScoringLogic}
                            onChange={e => setEditScoringLogic(e.target.value)}
                            rows={3}
                          />
                          <span className="form-helper">Describe how this packet should be scored</span>
                        </div>
                        <div className="btn-group">
                          <button className="btn btn--primary btn--sm" onClick={saveEditPacket}>
                            Save
                          </button>
                          <button className="btn btn--outline btn--sm" onClick={cancelEditPacket}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="packet-list-item__info">
                          <div className="packet-list-item__name">{packet.name}</div>
                          <div className="packet-list-item__meta">
                            <span className="badge badge--outline">{packet.questions?.length || 0} questions</span>
                            {packet.description && (
                              <p className="packet-list-item__desc">{packet.description}</p>
                            )}
                            {packet.scoringLogic && (
                              <span className="packet-list-item__scoring">Scoring: {packet.scoringLogic}</span>
                            )}
                            {packet.questions && packet.questions.length > 0 && (
                              <div className="packet-list-item__marks-range">
                                {(() => {
                                  const marks = calculatePacketMarks(packet.id);
                                  if (marks.minMarks === marks.maxMarks) {
                                    return `🎯 ${marks.minMarks} total marks`;
                                  } else {
                                    return `🎯 ${marks.minMarks}-${marks.maxMarks} total marks`;
                                  }
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="packet-list-item__actions" onClick={e => e.stopPropagation()}>
                          <button className="icon-btn" onClick={() => startEditPacket(packet)} title="Edit">
                            <EditIcon />
                          </button>
                          <button className="icon-btn icon-btn--danger" onClick={() => handleDeletePacket(packet.id)} title="Delete">
                            <DeleteIcon />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column / Main Content Area */}
        <div className="packet-manager__main" ref={configureAreaRef}>
          {selectedPacket ? (
            <div className="section-card">
              <h3 className="section-card__title">Add Question to Packet</h3>

              {/* Packet Marks Summary */}
              {currentPacketMarks.totalQuestions > 0 && (
                <div className="packet-scoring-box">
                  <div className="packet-scoring-box__header">
                    <h4 className="packet-scoring-box__title">
                      📊 Packet Scoring Range
                    </h4>
                    <button className="btn btn--outline btn--sm" onClick={openScoringScaleDialog}>
                      <SettingsIcon className="btn-icon" />
                      Configure Scale
                    </button>
                  </div>
                  <div className="packet-scoring-box__grid">
                    <div>Questions: <strong>{currentPacketMarks.totalQuestions}</strong></div>
                    <div>Score Range: <strong>{currentPacketMarks.minMarks} - {currentPacketMarks.maxMarks} marks</strong></div>
                  </div>
                  <p className="packet-scoring-box__helper">
                    💡 Students can score between {currentPacketMarks.minMarks} and {currentPacketMarks.maxMarks} total marks in this packet
                  </p>

                  {/* Scoring Scale Display */}
                  {enableScoringScale && scoringScale.length > 0 && (
                    <div className="scoring-scale-display">
                      <span className="scoring-scale-display__title">🎯 Performance Scale:</span>
                      <div className="scoring-scale-display__list">
                        {scoringScale.map((range, index) => (
                          <div key={index} className="scoring-scale-display__item">
                            <span 
                              className="scoring-scale-badge" 
                              style={{ backgroundColor: range.color }}
                            >
                              {range.image && range.image.startsWith('data:image') ? '🖼️' : range.image} {range.label} ({range.min}-{range.max})
                            </span>
                            {range.largeText && (
                              <span className="scoring-scale-quote">"{range.largeText}"</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Question Add Form */}
              <div className="form-row">
                <div className="form-group flex-2">
                  <label className="form-label">Question Text</label>
                  <input
                    type="text"
                    className="form-input"
                    value={questionText}
                    onChange={e => setQuestionText(e.target.value)}
                    placeholder="Enter question text..."
                  />
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">Type</label>
                  <select
                    className="form-input"
                    value={questionType}
                    onChange={e => handleQuestionTypeChange(e.target.value)}
                  >
                    <option value="MCQ">MCQ</option>
                    <option value="TrueFalse">True/False</option>
                  </select>
                </div>
              </div>

              {/* MCQ Options */}
              {questionType === 'MCQ' && (
                <div className="options-container">
                  <div className="options-header">
                    <h4 className="options-title">Options</h4>
                    <button className="btn btn--outline btn--sm" onClick={addOption}>
                      <AddIcon className="btn-icon" />
                      Add Option
                    </button>
                  </div>
                  <div className="options-list">
                    {options.map((opt, idx) => (
                      <div key={idx} className="option-row">
                        <div className="form-group flex-1">
                          <input
                            type="text"
                            className="form-input"
                            value={opt.text}
                            onChange={e => updateOptionText(idx, e.target.value)}
                            placeholder={`Option ${idx + 1}`}
                          />
                        </div>
                        <div className="form-group option-marks-input">
                          <input
                            type="number"
                            className="form-input"
                            value={opt.marks}
                            onChange={e => updateOptionMarks(idx, e.target.value)}
                            placeholder="Marks"
                            min={0}
                          />
                        </div>
                        <button 
                          className="icon-btn icon-btn--danger option-remove-btn" 
                          onClick={() => removeOption(idx)}
                          disabled={options.length <= 1}
                        >
                          <RemoveIcon />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* True/False Options */}
              {questionType === 'TrueFalse' && (
                <div className="options-container">
                  <h4 className="options-title">True/False Options</h4>
                  <div className="options-list">
                    {options.map((opt, idx) => (
                      <div key={idx} className="option-row option-row--tf">
                        <span className="tf-label">{opt.text}</span>
                        <div className="form-group option-marks-input">
                          <input
                            type="number"
                            className="form-input"
                            value={opt.marks}
                            onChange={e => updateOptionMarks(idx, e.target.value)}
                            placeholder="Marks"
                            min={0}
                          />
                        </div>
                        <span className="tf-helper-text">marks for {opt.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn btn--primary" onClick={handleAddQuestion} style={{ marginTop: 'var(--space-4)' }}>
                <AddCircleOutlineIcon className="btn-icon" />
                Add Question
              </button>

              <hr className="divider" />

              {/* Questions List */}
              <h3 className="section-card__title" style={{ marginTop: 'var(--space-6)' }}>Questions in Packet</h3>
              <div className="question-list">
                {packets.find(p => p.id === selectedPacket)?.questions?.map((q) => {
                  const isEditingThisQ = editingQuestionId === q.id;

                  return (
                    <div 
                      key={q.id} 
                      className={`question-item ${isEditingThisQ ? 'question-item--editing' : ''}`}
                    >
                      {isEditingThisQ ? (
                        <div className="question-edit-form">
                          <div className="form-group">
                            <label className="form-label">Question Text</label>
                            <input
                              type="text"
                              className="form-input"
                              value={editQuestionText}
                              onChange={e => setEditQuestionText(e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Type</label>
                            <select
                              className="form-input"
                              value={editQuestionType}
                              onChange={e => handleEditQuestionTypeChange(e.target.value)}
                            >
                              <option value="MCQ">MCQ</option>
                              <option value="TrueFalse">True/False</option>
                            </select>
                          </div>

                          <div className="options-container">
                            <div className="options-header">
                              <h4 className="options-title">Options</h4>
                              <button className="btn btn--outline btn--sm" onClick={addEditOption}>
                                <AddIcon className="btn-icon" />
                                Add Option
                              </button>
                            </div>
                            <div className="options-list">
                              {editOptions.map((opt, idx) => (
                                <div key={idx} className="option-row">
                                  <div className="form-group flex-1">
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={opt.text}
                                      onChange={e => updateEditOptionText(idx, e.target.value)}
                                      placeholder={`Option ${idx + 1}`}
                                    />
                                  </div>
                                  <div className="form-group option-marks-input">
                                    <input
                                      type="number"
                                      className="form-input"
                                      value={opt.marks}
                                      onChange={e => updateEditOptionMarks(idx, e.target.value)}
                                      placeholder="Marks"
                                      min={0}
                                    />
                                  </div>
                                  <button 
                                    className="icon-btn icon-btn--danger option-remove-btn" 
                                    onClick={() => removeEditOption(idx)}
                                    disabled={editOptions.length <= 1}
                                  >
                                    <RemoveIcon />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="btn-group" style={{ marginTop: 'var(--space-4)' }}>
                            <button 
                              className="btn btn--primary" 
                              onClick={() => saveEditQuestion(q.id)}
                            >
                              Save
                            </button>
                            <button 
                              className="btn btn--outline" 
                              onClick={() => {
                                setEditingQuestionId(null);
                                setEditQuestionText('');
                                setEditOptions([{ text: '', marks: 0 }]);
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="question-item__content">
                            <div className="question-item__text">{q.question_text || q.text}</div>
                            <div className="question-item__meta">
                              <span className="badge badge--outline">
                                Type: {(q.question_type === 'mcq' || q.type === 'mcq') ? 'MCQ' : 'True/False'}
                              </span>
                              <span className="badge badge--outline">
                                Total Marks: {q.options ? q.options.reduce((sum, opt) => sum + (opt.marks || 1), 0) : (q.marks || 1)}
                              </span>
                            </div>
                            {q.options && Array.isArray(q.options) && q.options.length > 0 && (
                              <div className="question-item__options-preview">
                                {q.options.map((opt, idx) => (
                                  <span key={idx} className="option-preview-pill">
                                    <strong>{opt.text}</strong> ({opt.marks}m)
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="question-item__actions">
                            <button className="icon-btn" onClick={() => startEditQuestion(q)} title="Edit">
                              <EditIcon />
                            </button>
                            <button className="icon-btn icon-btn--danger" onClick={() => handleDeleteQuestion(q.id)} title="Delete">
                              <DeleteIcon />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state__icon">
                <HelpOutlineIcon style={{ width: '48px', height: '48px' }} />
              </div>
              <p className="empty-state__title">No packet selected</p>
              <p className="empty-state__subtitle">Select a packet from the list or create a new one to manage questions.</p>
            </div>
          )}
        </div>
      </div>

      {/* Scoring Scale Configuration Modal */}
      {scoringScaleDialog && (
        <div className="modal-overlay">
          <div className="modal-container modal-container--lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">🎯 Configure Performance Scoring Scale</h3>
                <p className="modal-subtitle">Define performance ranges and labels for this packet</p>
              </div>
              <button className="modal-close-btn" onClick={closeScoringScaleDialog}>
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
              <div className="scoring-config-switch-group">
                <label className="switch-label">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={enableScoringScale}
                    onChange={(e) => setEnableScoringScale(e.target.checked)}
                  />
                  <span className="switch-slider"></span>
                  <span className="switch-text">Enable Custom Scoring Scale</span>
                </label>
              </div>

              {enableScoringScale && (
                <div className="scoring-config-details">
                  <div className="scoring-info-bar">
                    <span>Current Packet Range:</span> <strong>{currentPacketMarks?.minMarks || 0} - {currentPacketMarks?.maxMarks || 0} marks</strong>
                  </div>

                  <div className="scoring-actions-bar">
                    <button className="btn btn--outline btn--sm" onClick={addScoringRange}>
                      <AddIcon className="btn-icon" />
                      Add Performance Level
                    </button>
                    <span className="scoring-actions-bar__helper">
                      💡 Click to add more ranges (6, 8, or any number you need)
                    </span>
                  </div>

                  <div className="scoring-ranges-list">
                    {scoringScale.map((range, index) => (
                      <div key={index} className="scoring-range-card">
                        <button 
                          className="icon-btn icon-btn--danger scoring-range-card__delete"
                          onClick={() => removeScoringRange(index)}
                          disabled={scoringScale.length <= 2}
                          title="Remove level"
                        >
                          <RemoveIcon />
                        </button>

                        <h5 className="scoring-range-card__title">
                          Level {index + 1}: {range.label || 'Unnamed'}
                        </h5>

                        <div className="scoring-range-card__grid">
                          <div className="form-group">
                            <label className="form-label">Min Score</label>
                            <input
                              type="number"
                              className="form-input"
                              value={range.min}
                              onChange={(e) => updateScoringScaleRange(index, 'min', e.target.value)}
                              step="0.1"
                              placeholder="0.0"
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Max Score</label>
                            <input
                              type="number"
                              className="form-input"
                              value={range.max}
                              onChange={(e) => updateScoringScaleRange(index, 'max', e.target.value)}
                              step="0.1"
                              placeholder="10.0"
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Label</label>
                            <input
                              type="text"
                              className="form-input"
                              value={range.label}
                              onChange={(e) => updateScoringScaleRange(index, 'label', e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Color</label>
                            <input
                              type="text"
                              className="form-input"
                              value={range.color}
                              onChange={(e) => updateScoringScaleRange(index, 'color', e.target.value)}
                              placeholder="#8E66F1"
                            />
                          </div>
                          <div className="form-group image-upload-group">
                            <label className="form-label">Level Image</label>
                            <div className="image-upload-wrapper">
                              {range.image && range.image.startsWith('data:image') ? (
                                <div className="image-preview-thumbnail">
                                  <img src={range.image} alt={`Preview for ${range.label}`} />
                                </div>
                              ) : (
                                <span className="image-emoji-fallback">{range.image}</span>
                              )}
                              <input
                                accept="image/png,image/jpeg,image/jpg"
                                type="file"
                                onChange={(e) => handleImageUpload(index, e)}
                                style={{ display: 'none' }}
                                id={`image-upload-${index}`}
                              />
                              <label htmlFor={`image-upload-${index}`} className="btn btn--outline btn--sm image-upload-btn">
                                {range.image && range.image.startsWith('data:image') ? 'Change' : 'Upload'}
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
                          <label className="form-label">Motivational Large Text</label>
                          <textarea
                            className="form-input"
                            value={range.largeText || ''}
                            onChange={(e) => updateScoringScaleRange(index, 'largeText', e.target.value)}
                            rows={2}
                            placeholder="Enter motivational text for this performance level..."
                          />
                        </div>

                        {/* Range Preview */}
                        <div className="scoring-range-preview">
                          <div className="scoring-range-preview__header">Preview:</div>
                          <div className="scoring-range-preview__pill-row">
                            <span className="scoring-scale-badge" style={{ backgroundColor: range.color }}>
                              {range.image && range.image.startsWith('data:image') ? '🖼️' : range.image} {range.label} ({range.min}-{range.max})
                            </span>
                          </div>
                          {range.largeText && (
                            <div className="scoring-range-preview__large-text" style={{ backgroundColor: range.color }}>
                              {range.largeText}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="alert alert--warning" style={{ marginTop: 'var(--space-4)' }}>
                    💡 <strong>Flexible Scoring Scale:</strong> You can add as many performance levels as needed (6, 8, or more).
                    Make sure ranges connect properly without gaps. The system will automatically adjust min/max values when you add or remove levels.
                    <br />
                    ✨ <strong>Decimal Support:</strong> Score ranges now support decimal values (e.g., 0.5-3.75, 3.76-7.5) for precise grading!
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn--outline" onClick={closeScoringScaleDialog}>Cancel</button>
              <button
                className="btn btn--primary"
                onClick={saveScoringScale}
                disabled={!enableScoringScale}
              >
                Save Scale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PacketManager; 