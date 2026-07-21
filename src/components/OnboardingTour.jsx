import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import './OnboardingTour.css';

export default function OnboardingTour({ tourKey, steps = [], isOpen, onClose, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);

  // Position calculation helper
  const updatePosition = () => {
    if (!isOpen || steps.length === 0 || currentStep >= steps.length) {
      setTargetRect(null);
      return;
    }

    const step = steps[currentStep];
    const targetEl = document.getElementById(step.targetId);

    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const rect = targetEl.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    } else {
      setTargetRect({
        top: window.innerHeight / 2 - 50,
        left: window.innerWidth / 2 - 100,
        width: 200,
        height: 100,
      });
    }
  };

  useEffect(() => {
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, currentStep, steps]);

  if (!isOpen || steps.length === 0 || currentStep >= steps.length) {
    return null;
  }

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem(`schull_tour_${tourKey}`, 'completed');
      if (onComplete) onComplete();
      onClose();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirst) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(`schull_tour_${tourKey}`, 'completed');
    onClose();
  };

  // Compute Tooltip Placement
  let tooltipStyle = {};
  const padding = 16;
  const tooltipWidth = 380;
  const tooltipHeight = 220;

  if (targetRect) {
    let top = targetRect.top + targetRect.height + padding;
    let left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;

    if (top + tooltipHeight > window.innerHeight) {
      top = targetRect.top - tooltipHeight - padding;
    }

    if (top < padding) {
      top = padding;
    }

    if (left < padding) left = padding;
    if (left + tooltipWidth > window.innerWidth - padding) {
      left = window.innerWidth - tooltipWidth - padding;
    }

    tooltipStyle = { top: `${top}px`, left: `${left}px` };
  }

  return (
    <>
      {/* Backdrop Blur Overlay */}
      <div className="tour-backdrop-overlay" />

      {/* Spotlight Box Cutout (No Stroke, Dark Background Overlay) */}
      {targetRect && (
        <div
          className="tour-spotlight-box"
          style={{
            top: `${targetRect.top - 4}px`,
            left: `${targetRect.left - 4}px`,
            width: `${targetRect.width + 8}px`,
            height: `${targetRect.height + 8}px`,
          }}
        />
      )}

      {/* Floating Tooltip Card */}
      <div className="tour-tooltip-card" style={tooltipStyle}>
        <div className="tour-header">
          <span className="tour-badge">
            Step {currentStep + 1} of {steps.length}
          </span>
          <button className="tour-close-btn" onClick={handleSkip} title="Skip tour">
            <X size={14} />
          </button>
        </div>

        <div className="tour-title">{step.title}</div>
        <div className="tour-description">{step.description}</div>

        <div className="tour-footer">
          <div className="tour-progress-dots">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`tour-dot ${i === currentStep ? 'active' : ''}`}
              />
            ))}
          </div>

          <div className="tour-actions">
            {!isFirst && (
              <button className="btn btn-secondary btn-sm" onClick={handleBack}>
                <ChevronLeft size={14} /> Back
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={handleNext}>
              {isLast ? (
                <>
                  Got It <CheckCircle size={14} />
                </>
              ) : (
                <>
                  Next <ChevronRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
