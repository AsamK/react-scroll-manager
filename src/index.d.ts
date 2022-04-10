import React from 'react';
import { History } from 'history';

export interface ScrollManagerProps {
  history: History;
  sessionKey?: string;
  timeout?: number;
  children: React.ReactNode;
}

export class ScrollManager extends React.Component<ScrollManagerProps> { }

export class WindowScroller extends React.Component { }

export interface ElementScrollerProps {
  scrollKey: string;
  children: React.ReactNode;
}

export class ElementScroller extends React.Component<ElementScrollerProps> { }
